/**
 * A thread started from + in an agent's band (web/src/drafts.ts): it reads
 * "New thread" until it has text, and carries no label, so the session it
 * starts is named from its first message (ChatComposer: `label ?? titleFrom`).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const mem = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
}

const { draftStore, draftTitle } = await import('../web/src/drafts.js')

test('a new thread draft has no label, so its first message names the session', () => {
  draftStore.bind('fresh')
  const d = draftStore.create({ thread: true, agent: 'junior:debugger' })
  assert.equal(d.label, undefined)
  assert.equal(draftTitle(d), 'New thread')
  assert.equal(draftTitle({ ...d, text: 'Fix the flaky auth test\nmore' }), 'Fix the flaky auth test')
})

test('an empty thread draft is not reused as a plain new chat', () => {
  draftStore.bind('reuse')
  draftStore.create({ thread: true })
  assert.equal(draftStore.findEmpty(), undefined)
})

test('a stored "New thread" label from before loads as a thread, not a title', () => {
  mem.set('junior.drafts.legacy', JSON.stringify([
    { id: 'a', text: '', label: 'New thread', agent: 'junior:debugger', createdAt: 1 },
    { id: 'b', text: '', label: 'Fix CI on #12', itemId: 'github:o/r#12', createdAt: 2 },
  ]))
  draftStore.bind('legacy')
  const [a, b] = draftStore.all()
  assert.equal(a.label, undefined)
  assert.equal(a.thread, true)
  assert.equal(b.label, 'Fix CI on #12')
})
