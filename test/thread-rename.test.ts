/**
 * Renaming a thread from its chat header or its tab (web/src/threadRename.ts):
 * what a rename saves, and the one-at-a-time edit the tab's Rename starts.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renamedTo, threadRename } from '../web/src/threadRename.js'

test('a rename saves the trimmed title', () => {
  assert.equal(renamedTo('  Speed of light  ', 'what is speed of light'), 'Speed of light')
})

test('an empty or unchanged rename saves nothing', () => {
  assert.equal(renamedTo('   ', 'heya'), undefined)
  assert.equal(renamedTo('heya ', 'heya'), undefined)
})

test('one thread is renamed at a time, and listeners hear each change', () => {
  let heard = 0
  const off = threadRename.subscribe(() => heard++)
  threadRename.start('a')
  threadRename.start('b')
  assert.equal(threadRename.current(), 'b')
  threadRename.start('b')
  threadRename.end()
  assert.equal(threadRename.current(), null)
  assert.equal(heard, 3)
  off()
})
