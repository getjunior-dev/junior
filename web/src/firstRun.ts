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
 *
 * After the account come the tour steps: what Junior is, its team, and setting
 * up the workspace in chat. They show only on a daemon that was never
 * onboarded (someone already using Junior gets just the account step), until
 * the tour is finished or skipped once (`toured`, kept on this Mac).
 */
import { useSyncExternalStore, type ReactNode } from 'react'
import type { AccountState } from '../../shared/protocol.js'

/** What a step's `pending` reads. */
export type FirstRunState = {
  account: AccountState
  /** the daemon's onboarded flag (the workspace's Claude check has run) */
  onboarded: boolean
  /** the tour was finished or skipped on this Mac */
  toured: boolean
}

export type FirstRunCtx = {
  account: AccountState
  /** move to the next step (or close the screen after the last) */
  next: () => void
  /** go to a page of the app (a hash route, "/junior/needs") */
  navigate: (to: string) => void
}

export type FirstRunStep = {
  id: string
  /** still needs the user: the screen opens on the first pending step */
  pending: (state: FirstRunState) => boolean
  render: (ctx: FirstRunCtx) => ReactNode
  /** Not now, and Skip setup: answer the step without doing it, so it stops being pending */
  skip: () => Promise<unknown>
  /** the footer button moves on with this label ("Continue") instead of Not now */
  advance?: string
}

/** Open steps, in order; empty once first run is done, or while the state isn't known yet. */
export function pendingSteps(steps: readonly FirstRunStep[], state: FirstRunState | null): FirstRunStep[] {
  if (!state) return []
  return steps.filter((s) => s.pending(state))
}

/** A tour step is open while the daemon was never onboarded and the tour wasn't answered. */
export const tourPending = (s: FirstRunState): boolean => !s.onboarded && !s.toured

const TOURED_KEY = 'junior.firstRun.toured'
let toured: boolean | null = null
const subs = new Set<() => void>()

function readToured(): boolean {
  if (toured === null) {
    try {
      toured = localStorage.getItem(TOURED_KEY) === '1'
    } catch {
      toured = false
    }
  }
  return toured
}

/** Finish or skip the tour: it doesn't open again on this Mac. */
export async function markToured(): Promise<void> {
  try {
    localStorage.setItem(TOURED_KEY, '1')
  } catch {
    // storage blocked: this page load only
  }
  toured = true
  for (const fn of subs) fn()
}

export function useToured(): boolean {
  return useSyncExternalStore(
    (fn) => {
      subs.add(fn)
      return () => subs.delete(fn)
    },
    readToured,
  )
}
