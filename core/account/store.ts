/**
 * ~/.junior/account.json: the account Junior.app signed in as, daemon-wide (one
 * per Mac user, not per workspace). Written 0600 and atomically; it holds the
 * session token, which never leaves the daemon.
 */
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { AccountInfo, AccountState } from '../../shared/protocol.js'

export interface StoredAccount {
  /** the site this token belongs to: a token for one never goes to another */
  server: string
  token?: string
  account?: AccountInfo
  signedInAt?: string
  skippedAt?: string
  /** last time GET /api/auth/me said the session holds */
  checkedAt?: string
}

export async function readStored(file: string): Promise<StoredAccount | null> {
  try {
    const v = JSON.parse(await readFile(file, 'utf8')) as StoredAccount
    return v && typeof v.server === 'string' ? v : null
  } catch {
    return null
  }
}

export async function writeStored(file: string, v: StoredAccount): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(v, null, 2) + '\n', { mode: 0o600 })
  await chmod(tmp, 0o600)
  await rename(tmp, file)
}

/** What a page may see. A token for another server reads as signed out. */
export function stateOf(stored: StoredAccount | null, server: string): AccountState {
  if (stored && stored.server === server && stored.token && stored.account) return { status: 'signed-in', account: stored.account, server }
  if (stored?.skippedAt) return { status: 'skipped', server }
  return { status: 'none', server }
}
