/**
 * Two checks on a shell command (one policy, core/actions/policy.ts):
 *
 *   readOnlyCommand     runs alone in a session that asks before commands, a
 *                       short list of read verbs, no shell metacharacters at
 *                       all, so nothing can be chained, redirected or
 *                       substituted onto it
 *   destructiveCommand  the only thing that still waits for the user: work
 *                       you can't get back, here or on GitHub (deleting a
 *                       folder, a branch or a tag, closing a PR or an issue,
 *                       a force push to the default branch); every simple
 *                       command in the line is checked
 *
 * Pure and browser-safe.
 */
import { pushRefs, splitCommand, unwrap, type CommandPart } from './bash.js'
import { type BranchScope, isDefault } from './policy.js'

/** `gh`/`git` read verbs: the only shell a brief may run. */
export const GIT_READ_RE =
  /^\s*(gh\s+(pr|issue|api|search|run|repo)\s+(view|diff|checks|list|status|comments)\b|git\s+(log|show|diff|blame|status|branch|ls-files)\b)/
/** Plain lookups on top of those. `find` is read-only only without its acting flags. */
const LOOKUP_RE = /^\s*(ls|cat|head|tail|wc|grep|rg|pwd|which|find)(\s|$)/
const FIND_ACTS_RE = /\s-(exec|execdir|ok|okdir|delete|fprint|fprintf|fls)\b/
/** Anything that chains, redirects, substitutes or escapes. */
export const SHELL_META_RE = /[;&|<>`$\\\n]|\$\(/

/** A `gh`/`git` read with nothing attached. */
export const gitReadCommand = (cmd: string): boolean => GIT_READ_RE.test(cmd) && !SHELL_META_RE.test(cmd)

/** A command that only reads: git/gh reads plus plain lookups, nothing attached. */
export function readOnlyCommand(cmd: string): boolean {
  if (SHELL_META_RE.test(cmd)) return false
  if (GIT_READ_RE.test(cmd)) return true
  if (!LOOKUP_RE.test(cmd)) return false
  return !(/^\s*find\b/.test(cmd) && FIND_ACTS_RE.test(cmd))
}

const has = (part: CommandPart, ...flags: string[]) => part.some((w) => flags.includes(w))
/** `-rf`, `-fr`, `-R`, `--recursive`… */
const recursive = (part: CommandPart) => part.some((w) => w === '--recursive' || /^-[a-zA-Z]*[rR][a-zA-Z]*$/.test(w))

const FORCE_RE = /^-[a-zA-Z]*f[a-zA-Z]*$/
/** `git push` flags that delete on the remote: a branch, a tag, or every ref it doesn't have. */
const PUSH_DELETES = ['--delete', '-d', '--mirror', '--prune']
/** gh's global flags that take the next word as their value. */
const GH_VALUE_FLAGS = new Set(['-R', '--repo', '--hostname'])

/** gh's verb words, flags and their values skipped: `gh -R o/r pr close 12` → ['pr', 'close', '12']. */
function ghWords(part: CommandPart): string[] {
  const out: string[] = []
  for (let i = 1; i < part.length; i++) {
    if (GH_VALUE_FLAGS.has(part[i])) i++
    else if (!part[i].startsWith('-')) out.push(part[i])
  }
  return out
}

/** `gh api -X DELETE`, `-XDELETE`, `--method delete`, `--method=DELETE`. */
function apiDeletes(part: CommandPart): boolean {
  return part.some((w, i) => {
    if (w === '-X' || w === '--method') return part[i + 1]?.toUpperCase() === 'DELETE'
    return /^(-X|--method=)delete$/i.test(w)
  })
}

/** Why a `git push` destroys work: it deletes on the remote, or forces the default branch. */
function pushDestroys(part: CommandPart, s: BranchScope): string | null {
  const at = part.indexOf('push')
  const rest = part.slice(at + 1)
  if (rest.some((w) => PUSH_DELETES.includes(w) || w.startsWith('--prune='))) return 'deletes on the remote'
  // `git push origin :feat` deletes feat.
  if (rest.some((w) => w.startsWith(':') && w.length > 1)) return 'deletes a branch on the remote'
  const forced = rest.some((w) => w === '--force' || w.startsWith('--force-with-lease') || w.startsWith('+') || (FORCE_RE.test(w) && !w.startsWith('--')))
  if (!forced) return null
  // A force push rewrites history: free on your own branch, never on the default one, nor where we can't tell.
  const refs = pushRefs(part)
  const rewritesDefault = refs.some((r) => {
    if (r === 'unknown') return true
    const target = r === 'current' ? s.current : r.branch
    return !target || isDefault(target, s)
  })
  return rewritesDefault ? 'force-pushes the default branch' : null
}

/** Why one simple command destroys work, or null. */
function destroys(raw: CommandPart, s: BranchScope): string | null {
  const part = unwrap(raw)
  const [cmd, sub] = part
  if (!cmd) return null
  if (cmd === 'rm' && recursive(part)) return 'deletes a folder'
  if (cmd === 'rmdir') return 'deletes a folder'
  if (cmd === 'find' && has(part, '-delete')) return 'deletes the files it finds'
  if (cmd === 'dropdb') return 'drops a database'
  if (cmd === 'git') {
    if (sub === 'reset' && has(part, '--hard')) return 'throws away uncommitted work'
    if (sub === 'clean' && part.some((w) => /^-[a-zA-Z]*f/.test(w) || w === '--force')) return 'deletes untracked files'
    if ((sub === 'checkout' || sub === 'restore') && (has(part, '.', '--', ':/') || has(part, '--worktree'))) return 'throws away uncommitted work'
    if (sub === 'rm' && recursive(part)) return 'deletes a folder'
    if (sub === 'branch' && part.some((w) => w === '--delete' || /^-[a-zA-Z]*[dD][a-zA-Z]*$/.test(w))) return 'deletes a branch'
    if (sub === 'tag' && part.some((w) => w === '--delete' || w === '-d')) return 'deletes a tag'
    if (sub === 'stash' && (part[2] === 'drop' || part[2] === 'clear')) return 'deletes stashed work'
    if (part.includes('push')) {
      const why = pushDestroys(part, s)
      if (why) return why
    }
  }
  if (cmd === 'gh') {
    const [noun, verb] = ghWords(part)
    if ((noun === 'pr' || noun === 'issue') && verb === 'close') return `closes ${noun === 'pr' ? 'a PR' : 'an issue'}`
    if (noun === 'issue' && verb === 'delete') return 'deletes an issue'
    if (noun === 'repo' && (verb === 'delete' || verb === 'archive')) return `${verb === 'delete' ? 'deletes' : 'archives'} a repo`
    if (noun === 'release' && verb === 'delete') return 'deletes a release'
    if (noun === 'api' && apiDeletes(part)) return 'deletes something on GitHub'
  }
  if (part.some((w) => /\b(drop\s+(table|database|schema)|truncate\s+(table\s+)?\w)/i.test(w))) return 'drops or empties a table'
  return null
}

/**
 * Why the command destroys work you can't get back, or null. `scope`: where
 * the shell stands, for a force push; unknown = a force push to the checked-out
 * branch counts as the default one.
 */
export function destructiveCommand(cmd: string, scope: BranchScope = { current: null, defaultBranch: null }): string | null {
  const parts = splitCommand(cmd)
  // A `cd` first: the checked-out branch we know is the wrong folder's.
  const s = parts.some((p) => unwrap(p)[0] === 'cd' || unwrap(p)[0] === 'pushd') ? { ...scope, current: null } : scope
  for (const part of parts) {
    const why = destroys(part, s)
    if (why) return why
  }
  return null
}
