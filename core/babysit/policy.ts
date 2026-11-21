/**
 * What a babysit task's session may send (plan artifact f39a3a5e, "Push
 * policy"). Sends go out on their own, as in any chat (core/actions/policy.ts);
 * a task only keeps its pushes to its own PR:
 *
 *   allow    git push to the PR's head branch, forced or not; every other send
 *            (a comment, a reply, a reviewer request, a merge)
 *   refuse   pushing anything else: another branch, the default one, deleting
 *            or mirroring, an implicit push (the worktree's local branch isn't
 *            the PR's)
 *
 * What destroys work still waits for the user: the caller checks that first.
 * A first-pass review (core/review) is read-only: every send is refused,
 * since it hands its findings in.
 *
 * Pure: the command is sorted part by part by the caller's rules.
 */
import { pushTarget, splitCommand, unwrap, type CommandPart } from '../actions/bash.js'
import type { SortedAction } from '../actions/sort.js'

export type TaskRunScope = {
  /** the PR's head branch on origin */
  headRef: string
  /** the repo's default branch: never pushed to */
  defaultBranch: string
  /** the bot review thread this task is about, when it is one */
  threadId?: string | null
  /** a first-pass review: nothing may be sent at all, not even a push */
  readOnly?: boolean
  /** a fix on Junior’s own branch: it may open a PR from it */
  draftPr?: boolean
}

export type RunVerdict = { verdict: 'allow' } | { verdict: 'refuse'; reason: string }

function pushVerdict(part: CommandPart, s: TaskRunScope): RunVerdict {
  const w = unwrap(part)
  const push = `git push origin HEAD:${s.headRef}`
  if (w.some((t) => ['--delete', '-d', '--mirror', '--all', '--tags', '--prune'].includes(t)))
    return { verdict: 'refuse', reason: `Only pushes of this PR's branch run from a task. Use \`${push}\`.` }
  const target = pushTarget(part)
  if (!target) return { verdict: 'refuse', reason: `Name the PR's branch: \`${push}\`. This worktree's local branch isn't the PR's.` }
  if (target === s.defaultBranch || s.headRef === s.defaultBranch) return { verdict: 'refuse', reason: `${target} is the default branch: never pushed to from a task.` }
  if (target !== s.headRef) return { verdict: 'refuse', reason: `This task may push only to the PR's branch, ${s.headRef}: \`${push}\`.` }
  return { verdict: 'allow' }
}

/**
 * One Bash command from a task's session. A refused part refuses the whole
 * command; anything else runs.
 */
export function taskRunVerdict(command: string, s: TaskRunScope, sortPart: (part: string) => SortedAction | null): RunVerdict {
  for (const part of splitCommand(command)) {
    const sorted = sortPart(part.join(' '))
    if (!sorted) continue
    if (s.readOnly) return { verdict: 'refuse', reason: 'This task is read-only: nothing is pushed or sent from here. Hand in with your submit tool.' }
    if (sorted.kind !== 'push') continue
    const v = pushVerdict(part, s)
    if (v.verdict === 'refuse') return v
  }
  return { verdict: 'allow' }
}
