/**
 * Your Junior account (core/account): the client against a fake getjunior.dev,
 * the 0600 file it keeps, and what a page may see of it.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { authenticate, checkSession, endSession, type Fetch } from '../core/account/client.js'
import { readStored, stateOf, writeStored } from '../core/account/store.js'
import { pendingSteps, type FirstRunStep } from '../web/src/firstRun.js'

const BASE = 'https://getjunior.dev'
const ACCOUNT = { id: 'a1', email: 'sam@example.com', name: 'Sam', createdAt: '2026-11-25T00:00:00.000Z' }

function fakeFetch(status: number, body: unknown, seen: { url?: string; init?: RequestInit }[] = []): Fetch {
  return async (url, init) => {
    seen.push({ url, init })
    return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  }
}

test('sign up posts the form to /api/auth/signup and returns the account and token', async () => {
  const seen: { url?: string; init?: RequestInit }[] = []
  const r = await authenticate(fakeFetch(201, { account: ACCOUNT, token: 'jr_abc' }, seen), BASE, 'signup', {
    email: 'sam@example.com',
    password: 'long enough pw',
    name: 'Sam',
    device: 'Junior 1.0.3 on mac',
  })
  assert.deepEqual(r, { ok: true, account: { id: 'a1', email: 'sam@example.com', name: 'Sam' }, token: 'jr_abc' })
  assert.equal(seen[0].url, 'https://getjunior.dev/api/auth/signup')
  assert.equal(seen[0].init?.method, 'POST')
  assert.equal(JSON.parse(String(seen[0].init?.body)).device, 'Junior 1.0.3 on mac')
})

test("the site's error and field come through as they are", async () => {
  const r = await authenticate(fakeFetch(409, { error: 'There’s already an account with this email. Log in instead.', field: 'email' }), BASE, 'signup', {
    email: 'sam@example.com',
    password: 'long enough pw',
    device: 'd',
  })
  assert.deepEqual(r, { ok: false, error: 'There’s already an account with this email. Log in instead.', field: 'email' })
})

test('a 200 without a jr_ token is refused, not stored', async () => {
  const r = await authenticate(fakeFetch(200, { account: ACCOUNT, token: 'oops' }), BASE, 'login', { email: 'e', password: 'p', device: 'd' })
  assert.equal(r.ok, false)
})

test('offline names the site', async () => {
  const offline: Fetch = async () => {
    throw new TypeError('fetch failed')
  }
  const r = await authenticate(offline, BASE, 'login', { email: 'e', password: 'p', device: 'd' })
  assert.deepEqual(r, { ok: false, error: 'Couldn’t reach getjunior.dev. Check your connection and try again.' })
})

test('a 500 with no JSON says the status', async () => {
  const r = await authenticate(async () => new Response('<html>', { status: 502 }), BASE, 'login', { email: 'e', password: 'p', device: 'd' })
  assert.equal(r.ok, false)
  assert.match(r.ok ? '' : r.error, /502/)
})

test('a session check: 401 is gone, 200 is live, offline is unknown', async () => {
  assert.deepEqual(await checkSession(fakeFetch(401, { error: 'Not signed in.' }), BASE, 'jr_x'), { kind: 'gone' })
  assert.deepEqual(await checkSession(fakeFetch(200, { account: ACCOUNT }), BASE, 'jr_x'), { kind: 'live', account: { id: 'a1', email: 'sam@example.com', name: 'Sam' } })
  assert.deepEqual(await checkSession(fakeFetch(503, {}), BASE, 'jr_x'), { kind: 'unknown' })
  assert.deepEqual(
    await checkSession(async () => {
      throw new Error('offline')
    }, BASE, 'jr_x'),
    { kind: 'unknown' },
  )
})

test('log out sends the bearer and never throws', async () => {
  const seen: { url?: string; init?: RequestInit }[] = []
  await endSession(fakeFetch(204, undefined, seen), BASE, 'jr_tok')
  assert.equal(seen[0].url, 'https://getjunior.dev/api/auth/logout')
  assert.equal((seen[0].init?.headers as Record<string, string>).authorization, 'Bearer jr_tok')
  await endSession(async () => {
    throw new Error('offline')
  }, BASE, 'jr_tok')
})

test('the account file is written 0600 and reads back', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'junior-account-'))
  const file = path.join(dir, 'nested', 'account.json')
  assert.equal(await readStored(file), null)
  await writeStored(file, { server: BASE, token: 'jr_t', account: { id: 'a1', email: 'e', name: '' } })
  assert.equal((await stat(file)).mode & 0o777, 0o600)
  assert.equal((await readStored(file))?.token, 'jr_t')
  assert.match(await readFile(file, 'utf8'), /"server": "https:\/\/getjunior.dev"/)
})

test('a page sees the state, never the token; a token for another site reads as signed out', () => {
  const stored = { server: BASE, token: 'jr_t', account: { id: 'a1', email: 'e', name: 'n' } }
  const s = stateOf(stored, BASE)
  assert.deepEqual(s, { status: 'signed-in', account: stored.account, server: BASE })
  assert.doesNotMatch(JSON.stringify(s), /jr_t/)
  assert.deepEqual(stateOf(stored, 'http://localhost:3000'), { status: 'none', server: 'http://localhost:3000' })
  assert.deepEqual(stateOf({ server: BASE, skippedAt: 'x' }, BASE), { status: 'skipped', server: BASE })
  assert.deepEqual(stateOf(null, BASE), { status: 'none', server: BASE })
})

test('first run opens on the account step only while the account is unanswered', () => {
  const steps: FirstRunStep[] = [
    { id: 'account', pending: ({ account }) => account.status === 'none', render: () => null, skip: async () => {} },
    { id: 'later', pending: () => true, render: () => null, skip: async () => {} },
  ]
  assert.deepEqual(pendingSteps(steps, null), [])
  assert.deepEqual(pendingSteps(steps, { status: 'none', server: BASE }).map((s) => s.id), ['account', 'later'])
  assert.deepEqual(pendingSteps(steps, { status: 'skipped', server: BASE }).map((s) => s.id), ['later'])
  assert.deepEqual(
    pendingSteps(steps, { status: 'signed-in', server: BASE, account: { id: 'a', email: 'e', name: '' } }).map((s) => s.id),
    ['later'],
  )
})
