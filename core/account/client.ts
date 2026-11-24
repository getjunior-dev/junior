/**
 * Talks to getjunior.dev's account API (junior-web app/api/auth). Pure apart
 * from the fetch it is handed, so tests drive it with a fake one.
 *
 *   POST /api/auth/signup {email, password, name, device} → 201 {account, token}
 *   POST /api/auth/login  {email, password, device}       → 200 {account, token}
 *   GET  /api/auth/me     Bearer                          → 200 {account} | 401
 *   POST /api/auth/logout Bearer                          → 204
 */
import type { AccountField, AccountInfo } from '../../shared/protocol.js'

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>

export type AuthOutcome =
  | { ok: true; account: AccountInfo; token: string }
  | { ok: false; error: string; field?: AccountField }

export const TIMEOUT_MS = 15_000

function host(base: string): string {
  try {
    return new URL(base).host
  } catch {
    return base
  }
}

function asAccount(v: unknown): AccountInfo | null {
  const a = v as Partial<AccountInfo> | null
  if (!a || typeof a.id !== 'string' || typeof a.email !== 'string') return null
  return { id: a.id, email: a.email, name: typeof a.name === 'string' ? a.name : '' }
}

async function call(fetchFn: Fetch, url: string, init: RequestInit): Promise<Response> {
  return fetchFn(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
}

export async function authenticate(
  fetchFn: Fetch,
  base: string,
  kind: 'signup' | 'login',
  body: { email: string; password: string; name?: string; device: string },
): Promise<AuthOutcome> {
  let res: Response
  try {
    res = await call(fetchFn, `${base}/api/auth/${kind}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return { ok: false, error: `Couldn’t reach ${host(base)}. Check your connection and try again.` }
  }
  const data = (await res.json().catch(() => null)) as { account?: unknown; token?: unknown; error?: unknown; field?: unknown } | null
  if (res.ok) {
    const account = asAccount(data?.account)
    if (account && typeof data?.token === 'string' && data.token.startsWith('jr_')) return { ok: true, account, token: data.token }
    return { ok: false, error: `${host(base)} sent an answer Junior doesn’t understand.` }
  }
  const error = typeof data?.error === 'string' ? data.error : `${host(base)} answered ${res.status}. Try again in a minute.`
  const field = data?.field === 'email' || data?.field === 'password' || data?.field === 'name' ? data.field : undefined
  return { ok: false, error, field }
}

/** live: the session still holds. gone: the site said 401. unknown: offline, or the site is down. */
export async function checkSession(fetchFn: Fetch, base: string, token: string): Promise<{ kind: 'live'; account: AccountInfo } | { kind: 'gone' } | { kind: 'unknown' }> {
  try {
    const res = await call(fetchFn, `${base}/api/auth/me`, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } })
    if (res.status === 401) return { kind: 'gone' }
    if (!res.ok) return { kind: 'unknown' }
    const account = asAccount(((await res.json().catch(() => null)) as { account?: unknown } | null)?.account)
    return account ? { kind: 'live', account } : { kind: 'unknown' }
  } catch {
    return { kind: 'unknown' }
  }
}

/** Best effort: signing out here never waits on the site. */
export async function endSession(fetchFn: Fetch, base: string, token: string): Promise<void> {
  try {
    await call(fetchFn, `${base}/api/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${token}` } })
  } catch {
    // offline: the session expires on its own after 90 days unused
  }
}
