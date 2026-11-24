import type { AccountResponse } from '../../shared/protocol.js'
import { accountState, signIn, signOut, skipAccount } from '../account.js'
import { errText } from '../errors.js'
import { log } from '../log.js'
import type { RouteCtx } from './ctx.js'
import { readJsonBody } from './http-util.js'

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/**
 * Your Junior account, daemon-wide (server/account.ts). GET /api/account;
 * POST /api/account/{signup,login,logout,skip}. Every answer is an
 * AccountResponse: the state, never the token. Bodies are never logged.
 */
export async function accountRoutes({ req, url, json }: RouteCtx): Promise<boolean> {
  if (!url.pathname.startsWith('/api/account')) return false
  const send = (status: number, body: AccountResponse) => json(status, body)
  try {
    if (url.pathname === '/api/account' && req.method === 'GET') {
      send(200, { ok: true, state: await accountState() })
      return true
    }
    if (req.method !== 'POST') return false
    const action = url.pathname.slice('/api/account/'.length)
    if (action === 'signup' || action === 'login') {
      const body = (await readJsonBody(req, 20_000).catch(() => null)) as Record<string, unknown> | null
      const r = await signIn(action, { email: str(body?.email), password: str(body?.password), name: action === 'signup' ? str(body?.name) : undefined })
      if (!r.ok) send(200, { ok: false, error: r.error, field: r.field })
      else send(200, { ok: true, state: await accountState() })
      return true
    }
    if (action === 'logout') await signOut()
    else if (action === 'skip') await skipAccount()
    else return false
    send(200, { ok: true, state: await accountState() })
  } catch (err) {
    log('error', 'account', 'request failed', { path: url.pathname, err: errText(err) })
    send(500, { ok: false, error: errText(err) })
  }
  return true
}
