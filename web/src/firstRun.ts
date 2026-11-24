/**
 * First run, in Junior.app or a browser on this Mac: the setup screen
 * (components/FirstRun.tsx) and its steps. It shows while a step still
 * wants an answer, before the workspace's Claude login check (App.tsx holds
 * that modal back until this is done).
 *
 * Steps run in order. Add one by appending to FIRST_RUN_STEPS: `pending` says
 * whether it still needs the user (the account step: never signed in and never
 * skipped), `render` draws its body. "Signed in, first run" is the account
 * step done (status signed-in) with later steps still pending.
 */
import type { ReactNode } from 'react'
import type { AccountState } from '../../shared/protocol.js'

export type FirstRunCtx = {
  account: AccountState
  /** move to the next step (or close the screen after the last) */
  next: () => void
}

export type FirstRunStep = {
  id: string
  /** still needs the user: the screen opens on the first pending step */
  pending: (ctx: { account: AccountState }) => boolean
  render: (ctx: FirstRunCtx) => ReactNode
  /** Not now, and Skip setup: answer the step without doing it, so it stops being pending */
  skip: () => Promise<unknown>
}

/** Open steps, in order; empty once first run is done. */
export function pendingSteps(steps: readonly FirstRunStep[], account: AccountState | null): FirstRunStep[] {
  if (!account) return []
  return steps.filter((s) => s.pending({ account }))
}
