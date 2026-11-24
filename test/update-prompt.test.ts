/**
 * Junior.app's in-app update prompt (desktop/src/update-prompt.ts): when
 * "Not now" holds, and what's new cut down from the release body.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_NOTES, SNOOZE_MS, parseDismissed, releaseNoteLines, shouldPrompt } from '../desktop/src/update-prompt.js'

test('a version never dismissed asks', () => {
  assert.equal(shouldPrompt('1.2.0', null, 0), true)
})

test('"Not now" holds for a day, then the same version asks again', () => {
  const d = { version: '1.2.0', at: 1_000 }
  assert.equal(shouldPrompt('1.2.0', d, 1_000 + SNOOZE_MS - 1), false)
  assert.equal(shouldPrompt('1.2.0', d, 1_000 + SNOOZE_MS), true)
})

test('a newer version asks at once, whatever was dismissed', () => {
  assert.equal(shouldPrompt('1.3.0', { version: '1.2.0', at: 1_000 }, 1_001), true)
})

test('a saved dismissal reads back; anything else is null', () => {
  assert.deepEqual(parseDismissed({ version: '1.2.0', at: 5 }), { version: '1.2.0', at: 5 })
  assert.equal(parseDismissed(null), null)
  assert.equal(parseDismissed({ version: '', at: 5 }), null)
  assert.equal(parseDismissed({ version: '1.2.0', at: 'x' }), null)
  assert.equal(parseDismissed('1.2.0'), null)
})

test('release notes: list items from the GitHub HTML, markup and entities gone', () => {
  const html = '<h2>What changed</h2><ul><li>Jobs run as <strong>threads</strong></li>\n<li>Fix &amp; tidy the <a href="x">log</a></li></ul>'
  assert.deepEqual(releaseNoteLines(html), ['Jobs run as threads', 'Fix & tidy the log'])
})

test('release notes: markdown bullets when there is no list, headings dropped', () => {
  assert.deepEqual(releaseNoteLines('## v1.2.0\n- One\n- Two\nThanks'), ['One', 'Two'])
})

test('release notes: plain lines when there are no bullets', () => {
  assert.deepEqual(releaseNoteLines('<p>Faster start.</p><p>Fewer restarts.</p>'), ['Faster start.', 'Fewer restarts.'])
})

test('release notes: the per-version array form, capped and trimmed', () => {
  const many = Array.from({ length: 8 }, (_, i) => ({ version: '1', note: `<li>Item ${i}</li>` }))
  assert.equal(releaseNoteLines(many).length, MAX_NOTES)
  assert.equal(releaseNoteLines(`<li>${'a'.repeat(300)}</li>`)[0].length, 140)
})

test('release notes: nothing in, nothing out', () => {
  assert.deepEqual(releaseNoteLines(null), [])
  assert.deepEqual(releaseNoteLines(''), [])
  assert.deepEqual(releaseNoteLines([]), [])
})
