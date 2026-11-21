/**
 * What a babysit task may send (core/babysit/policy.ts), sorted by the
 * default actions file: pushes to the PR's branch run, forced or not; other
 * branches, the default one and implicit pushes are refused; every other
 * send runs.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sortCall } from '../core/actions/sort.js'
import { DEFAULT_RULES } from '../core/actions/rules.js'
import { taskRunVerdict } from '../core/babysit/policy.js'

const sort = (part: string) => sortCall('Bash', { command: part }, { rules: DEFAULT_RULES })
const scope = { headRef: 'feat/retries', defaultBranch: 'main', threadId: 'PRRT_kwDOabc' }
const v = (cmd: string) => taskRunVerdict(cmd, scope, sort).verdict

test('pushes to the PR branch run, with a lease too', () => {
  assert.equal(v('git push origin HEAD:feat/retries'), 'allow')
  assert.equal(v('git add -A && git commit -m "fix lint" && git push origin HEAD:feat/retries'), 'allow')
  assert.equal(v('git push --force-with-lease origin HEAD:feat/retries'), 'allow')
  assert.equal(v('git push --dry-run origin HEAD:main'), 'allow', 'a dry run sends nothing')
})

test('a force push to the PR branch runs; other branches, the default branch and implicit pushes are refused', () => {
  assert.equal(v('git push --force origin HEAD:feat/retries'), 'allow')
  assert.equal(v('git push -f origin HEAD:feat/retries'), 'allow')
  assert.equal(v('git push origin +HEAD:feat/retries'), 'allow')
  assert.equal(v('git push origin HEAD:main'), 'refuse')
  assert.equal(v('git push origin HEAD:feat/other'), 'refuse')
  assert.equal(v('git push'), 'refuse')
  assert.equal(v('git push origin --delete feat/retries'), 'refuse')
  const r = taskRunVerdict('git push', scope, sort)
  assert.ok(r.verdict === 'refuse' && r.reason.includes('git push origin HEAD:feat/retries'))
})

test('every other send runs: thread replies, comments, reviewer requests, merges', () => {
  const resolve = `gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' -f id=PRRT_kwDOabc`
  assert.equal(v(resolve), 'allow')
  assert.equal(v(resolve.replace('PRRT_kwDOabc', 'PRRT_other')), 'allow')
  assert.equal(v('gh pr comment 12 --body "done"'), 'allow')
  assert.equal(v('gh pr edit 12 --add-reviewer anirudha'), 'allow')
  assert.equal(v('gh pr merge 12 --squash'), 'allow')
  assert.equal(v('git push origin HEAD:feat/retries && gh pr comment 12 --body hi'), 'allow')
})

test('local work is not an action', () => {
  assert.equal(v('npm run lint -- --fix && git commit -am "lint"'), 'allow')
  assert.equal(v('gh pr diff 12'), 'allow')
})

test('a first-pass review is read-only: every send is refused, reading still runs', () => {
  const ro = { headRef: 'drew/cache', defaultBranch: 'main', readOnly: true }
  const r = (cmd: string) => taskRunVerdict(cmd, ro, sort).verdict
  assert.equal(r('git push origin HEAD:drew/cache'), 'refuse')
  assert.equal(r('gh pr review 40 --approve'), 'refuse')
  assert.equal(r('gh pr comment 40 --body "lgtm"'), 'refuse')
  assert.equal(r('gh pr diff 40 && git log -5'), 'allow')
  assert.equal(r('rg "token" src'), 'allow')
})
