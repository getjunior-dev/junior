/**
 * One policy for chats and runs: sends go out on their own, and each leaves
 * a record (a Sent card under the call, a line in Junior's log). Only what
 * destroys work you can't get back waits for the user: deleting a folder, a
 * branch or a tag, closing a PR or an issue, a force push to the default
 * branch, a connector call that deletes, closes or cancels
 * (core/actions/commands.ts destructiveCommand, core/actions/sort.ts
 * destructiveTool).
 *
 * A command only the shell knows (`$G push`, `eval "$CMD"`, `… | xargs git`)
 * can't be judged from its text, so it waits like a destructive one.
 *
 * Pure and browser-safe.
 */
import type { PermissionMode, ProviderId } from '../../shared/protocol.js'
import { scriptOf, splitCommand, unknownCommand, unwrap } from './bash.js'
import { type BranchScope, destructiveCommand } from './commands.js'
import type { SortedAction } from './sort.js'

export { type BranchScope, isDefault } from './commands.js'

/**
 * The mode every chat runs at. Claude: local work and sends run, a
 * destructive call asks through the veto. Another agent has no hooks to tell
 * a send from a delete, so it asks before every change instead.
 */
export const chatPermissionMode = (provider: ProviderId | null | undefined): PermissionMode => ((provider ?? 'claude') === 'claude' ? 'auto' : 'gated')

/**
 * What one Bash command does under the policy:
 *   local     nothing in it leaves this machine or destroys anything
 *   send      something in it goes out: it runs, and is recorded
 *   destroys  it throws away work you can't get back: it waits for the user
 *   unknown   only the shell knows what it runs: it waits for the user
 */
export type ShellVerdict = { verdict: 'local' } | { verdict: 'send' } | { verdict: 'destroys'; why: string } | { verdict: 'unknown' }

/** One Bash command, judged: destroys first, then a part only the shell knows, then whether anything in it sends. */
export function shellVerdict(command: string, s: BranchScope, sortPart: (part: string) => SortedAction | null): ShellVerdict {
  const why = destructiveCommand(command, s)
  if (why) return { verdict: 'destroys', why }
  let send = false
  for (const part of splitCommand(command)) {
    // `$G push`, `xargs git`, `xargs -I{} sh -c {}`: the shell decides what runs, not us.
    if (unknownCommand(part)) return { verdict: 'unknown' }
    // `eval "…"` and `bash -c "…"`: their own parts follow and are judged one by one.
    if (scriptOf(part) !== null) continue
    if (sortPart(part.join(' '))) send = true
  }
  return send ? { verdict: 'send' } : { verdict: 'local' }
}

/**
 * A command that reaches Junior's own approval endpoints: approving a held
 * call, approving a task, marking a tool "not an action". Only the user does
 * those, from the app. A speed bump for an agent, not a wall: anything
 * running as you can reach the daemon.
 */
export const selfApproval = (command: string): boolean => /\/api\/(approvals\b|actions\/(approve|override|retry)\b|tasks\/approve\b)/.test(command)

/** A push: the only command whose verdict needs the branch the shell is on (a force push to the default one destroys). */
export const needsBranch = (command: string): boolean => /\bgit\b[\s\S]*\bpush\b/.test(command)

/**
 * A chat agent whose `tools` line leaves Bash out (core/junior/agents.ts
 * shellSendOnly) keeps a shell for sends only. True when every part of the
 * command sorts as a send (a `cd` first aside); the send itself is then judged
 * like any chat's. A command only the shell knows is not one.
 */
export function sendOnlyShell(command: string, sortPart: (part: string) => SortedAction | null): boolean {
  const parts = splitCommand(command).filter((p) => p.length > 0)
  let sends = 0
  for (const part of parts) {
    const w = unwrap(part)
    if (w[0] === 'cd') continue
    if (unknownCommand(part) || scriptOf(part) !== null) return false
    if (!sortPart(part.join(' '))) return false
    sends++
  }
  return sends > 0
}
