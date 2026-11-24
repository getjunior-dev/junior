/**
 * Your Junior account (server/account.ts), as the page sees it: the state,
 * never the token. One fetch per page load, shared by every reader; the
 * actions post through the daemon, which talks to getjunior.dev.
 */
import { useSyncExternalStore } from 'react'
import type { AccountField, AccountResponse, AccountState } from '../../shared/protocol.js'

let state: AccountState | null = null
let loading: Promise<void> | null = null
const subs = new Set<() => void>()

function set(next: AccountState) {
  state = next
  for (const fn of subs) fn()
}

function load() {
  loading ??= fetch('/api/account')
    .then((r) => r.json() as Promise<AccountResponse>)
    .then((r) => {
      if (r.ok) set(r.state)
    })
    .catch(() => {
      // daemon unreachable: the first run waits rather than guessing
    })
    .finally(() => (loading = null))
}

/** null until the daemon answers. */
export function useAccount(): AccountState | null {
  return useSyncExternalStore(
    (fn) => {
      subs.add(fn)
      if (!state) load()
      return () => subs.delete(fn)
    },
    () => state,
  )
}

export type AccountError = { error: string; field?: AccountField }

async function post(action: string, body?: unknown): Promise<AccountError | null> {
  try {
    const res = await fetch(`/api/account/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    })
    const r = (await res.json()) as AccountResponse
    if (!r.ok) return { error: r.error, field: r.field }
    set(r.state)
    return null
  } catch {
    return { error: 'Junior’s server didn’t answer. Is it running?' }
  }
}

export const signUp = (b: { name: string; email: string; password: string }) => post('signup', b)
export const logIn = (b: { email: string; password: string }) => post('login', b)
export const logOut = () => post('logout')
export const skipAccount = () => post('skip')
