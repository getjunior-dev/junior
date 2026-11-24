/**
 * Your Junior account (server/account.ts): who you are on getjunior.dev. The
 * daemon keeps the session token in ~/.junior/account.json and never sends it
 * to a page; pages see only this.
 */
export interface AccountInfo {
  id: string
  email: string
  name: string
}

/** none = never asked or signed out; skipped = Not now on first run. */
export type AccountState =
  | { status: 'signed-in'; account: AccountInfo; server: string }
  | { status: 'none' | 'skipped'; server: string }

export type AccountField = 'email' | 'password' | 'name'

/** GET /api/account, and the answer to every POST under it. */
export type AccountResponse = { ok: true; state: AccountState } | { ok: false; error: string; field?: AccountField }
