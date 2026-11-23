/**
 * The question card's picks (web/src/askQuestions.ts): a "(Recommended)"
 * option starts selected and shows as a tag, not in its label.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { preselected, shownAnswer, shownLabel, type AskQuestion } from '../web/src/askQuestions.js'

const q = (labels: string[], multiSelect = false): AskQuestion => ({
  question: 'Which?',
  options: labels.map((label) => ({ label })),
  multiSelect,
})

test('the recommended option starts selected', () => {
  assert.deepEqual(preselected(q(['A', 'B (Recommended)', 'C'])), ['B (Recommended)'])
})

test('no recommendation, nothing selected', () => {
  assert.deepEqual(preselected(q(['A', 'B'])), [])
})

test('a single-choice question keeps only the first recommendation', () => {
  assert.deepEqual(preselected(q(['A (Recommended)', 'B (recommended)'])), ['A (Recommended)'])
})

test('a multi-select keeps every recommendation', () => {
  assert.deepEqual(preselected(q(['A (Recommended)', 'B', 'C (Recommended)'], true)), ['A (Recommended)', 'C (Recommended)'])
})

test('labels and answers drop "(Recommended)"', () => {
  assert.equal(shownLabel('Unknown, ask (Recommended)'), 'Unknown, ask')
  assert.equal(shownLabel('Recommended reading'), 'Recommended reading')
  assert.equal(shownAnswer('A (Recommended), C (Recommended)'), 'A, C')
})
