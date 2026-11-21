/**
 * check_send: a dry run of the send policy (core/actions/policy.ts) for any
 * agent on this Mac. Cursor, Codex or a terminal Claude Code asks "would
 * this go out as the user?" before it acts, and gets the answer Junior's own
 * chats live by:
 *
 *   free      local work, a read, or a send: sends go out without asking,
 *             and Junior's log records each one
 *   destroys  it throws away work you can't get back (a delete, a close, a
 *             force push to the default branch), so it asks first
 *   refused   it would approve held calls through Junior's own API: only the
 *             user does that, in the app
 *
 * `held` is no longer answered; it stays in the type for older callers.
 * Judged in the same order as a Claude chat's veto (server/session/
 * actions-hold.ts sessionVeto → holdIfAction): self-approval, destroys, sends.
 * It never runs, sends or queues anything; the caller stays the one who acts.
 *
 * The dry run can't see how a server was registered (core/actions/own.ts), so
 * no server counts as Junior's own here: every MCP call is sorted on its
 * merits. Pure and browser-safe.
 */
import type { AdvanceApproval } from '../approvals/approvals.js'
import { NO_OWN_SERVERS } from './own.js'
import { type BranchScope, selfApproval, shellVerdict } from './policy.js'
import type { ActionRules } from './rules.js'
import { destructiveTool, leafOf, serverOf, sortCall, toolOverride, type SortedAction, type ToolHints, unsortedAction } from './sort.js'
import type { SendCheck } from './types.js'

export type { SendCheck, SendVerdict } from './types.js'
export { SEND_VERDICTS } from './types.js'

export type CheckContext = {
  /** the workspace's actions file */
  rules: ActionRules
  /** what an MCP server says about its tools, when a probe saw it */
  hints?: (toolName: string) => ToolHints | undefined
  /** where the shell stands; unknown = nulls, so `git push --force` with no branch named counts as the default one */
  scope: BranchScope
  /** no longer read: advance approvals have nothing left to approve */
  approvals?: readonly AdvanceApproval[]
  now: number
}

const SORTED_BY: Record<SortedAction['why'], string> = {
  'bash pattern': 'matches',
  override: 'the actions file counts it:',
  annotation: 'its server marks it',
  'name verb': 'its name says',
  unknown: "Junior can't tell what it does, so it counts as a send",
}

function sortedBy(s: SortedAction): string {
  const lead = SORTED_BY[s.why]
  return s.whyDetail ? `${lead} ${s.whyDetail}` : lead
}

/** Why an MCP call the sort let through is free. */
function freeMcpWhy(tool: string, ctx: CheckContext): string {
  if (toolOverride(ctx.rules, tool)?.verdict === 'off') return 'The actions file sets this tool aside: it is not a send.'
  const h = ctx.hints?.(tool)
  if (h?.readOnly === true) return `${serverOf(tool)} marks ${leafOf(tool)} read-only: nothing goes out.`
  if (h?.openWorld === false) return `${serverOf(tool)} says ${leafOf(tool)} stays inside its own system: nothing goes out.`
  return `${leafOf(tool)} reads: nothing goes out.`
}

/** The answer for a call that sorted as a send: it goes out without asking. */
function sendAnswer(s: SortedAction): SendCheck {
  return { verdict: 'free', why: `It sends (${s.summary}). Sends go out without asking, and Junior's log records it.`, kind: s.kind, summary: s.summary, sortedBy: sortedBy(s) }
}

/**
 * Would this call go out as the user? `tool` is the name an agent calls it
 * by (`Bash`, `Edit`, `mcp__<server>__<tool>`), `input` its arguments.
 */
export function checkSend(tool: string, input: Record<string, unknown>, ctx: CheckContext): SendCheck {
  let unjudged = false
  const sort = (t: string, i: Record<string, unknown>): SortedAction | null => {
    try {
      return sortCall(t, i, { rules: ctx.rules, hints: ctx.hints?.(t), own: NO_OWN_SERVERS })
    } catch {
      // The hold fails closed: a call it can't sort waits for the user.
      unjudged = true
      return unsortedAction(t, i)
    }
  }
  const UNJUDGED: SendCheck = { verdict: 'destroys', why: "Junior couldn't tell what this call does, so it needs the user's OK first." }

  if (tool === 'Bash') {
    const command = typeof input.command === 'string' ? input.command : ''
    if (!command.trim()) return { verdict: 'free', why: 'An empty command runs nothing.' }
    if (selfApproval(command)) return { verdict: 'refused', why: "It approves sends through Junior's own API. Only the user does that, in the app." }
    let v: ReturnType<typeof shellVerdict>
    try {
      v = shellVerdict(command, ctx.scope, (part) => sort('Bash', { command: part }))
    } catch {
      v = { verdict: 'unknown' }
    }
    if (v.verdict === 'destroys') return { verdict: 'destroys', why: `This command ${v.why}, so it needs the user's OK first.` }
    if (unjudged) return UNJUDGED
    if (v.verdict === 'unknown') return { verdict: 'destroys', why: "Only the shell knows what this command runs, so it needs the user's OK first." }
    if (v.verdict === 'local') return { verdict: 'free', why: 'Local work: nothing in this command leaves this Mac.' }
    return sendAnswer(sort('Bash', input) ?? unsortedAction(tool, input))
  }

  // Write, Edit, Read, NotebookEdit…: they touch this Mac at most.
  if (!tool.startsWith('mcp__')) return { verdict: 'free', why: `Local work: ${tool} touches this Mac at most, and nothing goes out.` }

  const s = sort(tool, input)
  if (unjudged) return UNJUDGED
  if (!s) return { verdict: 'free', why: freeMcpWhy(tool, ctx) }
  const destroys = destructiveTool(tool, ctx.hints?.(tool))
  if (destroys) return { verdict: 'destroys', why: `This call ${destroys}, so it needs the user's OK first.`, kind: s.kind, summary: s.summary, sortedBy: sortedBy(s) }
  return sendAnswer(s)
}
