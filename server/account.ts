/**
 * Junior.app's account on getjunior.dev: sign up, log in, log out, Not now.
 * The daemon makes the calls (no CORS, and the token never reaches a page).
 * JUNIOR_ACCOUNT_URL points it at another site, e.g. http://localhost:3000
 * for junior-web's `npm run dev`.
 */
import os from 'node:os'
import path from 'node:path'
import type { AccountState } from '../shared/protocol.js'
import { authenticate, checkSession, endSession, type AuthOutcome } from '../core/account/client.js'
import { readStored, stateOf, writeStored } from '../core/account/store.js'
import { VERSION } from './config.js'
import { JUNIOR_DIR } from './state.js'
import { log } from './log.js'

export const ACCOUNT_SERVER = (process.env.JUNIOR_ACCOUNT_URL || 'https://getjunior.dev').replace(/\/+$/, '')
const FILE = path.join(JUNIOR_DIR, 'account.json')
/** How often a page load re-checks the session with the site. */
const RECHECK_MS = 6 * 60 * 60_000

let checking: Promise<void> | null = null

export async function accountState(): Promise<AccountState> {
  const stored = await readStored(FILE)
  const state = stateOf(stored, ACCOUNT_SERVER)
  // A session ended on the site (expired, logged out elsewhere) signs this Mac out too.
  // In the background: a page load never waits on the network.
  const due = !stored?.checkedAt || !(Date.now() - Date.parse(stored.checkedAt) < RECHECK_MS)
  if (state.status === 'signed-in' && stored?.token && due && !checking) {
    const token = stored.token
    checking = checkSession(fetch, ACCOUNT_SERVER, token)
      .then(async (r) => {
        const now = await readStored(FILE)
        if (now?.token !== token) return
        if (r.kind === 'gone') {
          log('info', 'account', 'session ended on the site, signed out')
          await writeStored(FILE, { server: ACCOUNT_SERVER })
        } else if (r.kind === 'live') {
          await writeStored(FILE, { ...now, account: r.account, checkedAt: new Date().toISOString() })
        }
      })
      .catch((err) => log('warn', 'account', 'check failed', { err: String(err) }))
      .finally(() => (checking = null))
  }
  return state
}

export async function signIn(
  kind: 'signup' | 'login',
  body: { email: string; password: string; name?: string },
): Promise<AuthOutcome> {
  const device = `Junior ${VERSION} on ${os.hostname().replace(/\.local$/, '')}`
  const r = await authenticate(fetch, ACCOUNT_SERVER, kind, { ...body, device })
  if (r.ok) {
    const at = new Date().toISOString()
    await writeStored(FILE, { server: ACCOUNT_SERVER, token: r.token, account: r.account, signedInAt: at, checkedAt: at })
    log('info', 'account', kind === 'signup' ? 'signed up' : 'logged in', { accountId: r.account.id })
  }
  return r
}

export async function signOut(): Promise<void> {
  const stored = await readStored(FILE)
  await writeStored(FILE, { server: ACCOUNT_SERVER })
  if (stored?.token && stored.server === ACCOUNT_SERVER) await endSession(fetch, ACCOUNT_SERVER, stored.token)
  log('info', 'account', 'signed out')
}

/** Not now on first run: asked once; Settings → Account signs in later. */
export async function skipAccount(): Promise<void> {
  const stored = await readStored(FILE)
  await writeStored(FILE, { ...(stored ?? {}), server: stored?.server ?? ACCOUNT_SERVER, skippedAt: new Date().toISOString() })
}
