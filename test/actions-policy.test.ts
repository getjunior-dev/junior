/**
 * One policy (core/actions/policy.ts), sorted by the default actions file:
 * every send goes out on its own; what destroys work, or what only the shell
 * knows, waits for the user.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sortCall } from '../core/actions/sort.js'
import { DEFAULT_RULES } from '../core/actions/rules.js'
import { chatPermissionMode, needsBranch, shellVerdict, type BranchScope } from '../core/actions/policy.js'

const sort = (part: string) => sortCall('Bash', { command: part }, { rules: DEFAULT_RULES })
const onFeat: BranchScope = { current: 'feat/retries', defaultBranch: 'main' }
const v = (cmd: string, s: BranchScope = onFeat) => shellVerdict(cmd, s, sort).verdict

test('every send goes out: pushes, PRs, comments, merges', () => {
  for (const cmd of [
    'git push origin feat/retries',
    'git push -u origin HEAD',
    'git push',
    'git push origin main',
    'git push --force origin feat/retries',
    'git push origin +HEAD:feat/retries',
    'git add -A && git commit -m "x" && git push --force-with-lease origin HEAD:feat/retries',
    'gh pr create --title "Fix" --body "x"',
    'gh pr create --draft --title "Fix" --body "x"',
    'gh pr comment 12 --body "hi"',
    'gh pr edit 12 --add-reviewer anirudha',
    'gh pr ready 12',
    'gh pr merge 12 --squash --delete-branch',
    'git push origin feat/retries && gh pr comment 12 --body hi',
  ]) assert.equal(v(cmd), 'send', cmd)
})

test('what destroys work waits: deletes, closes, a force push to the default branch', () => {
  for (const cmd of [
    'git push origin --delete feat/retries',
    'git push origin :feat/retries',
    'git push --force origin main',
    'git push -f origin HEAD:main',
    'gh pr close 12',
    'gh issue close 3',
    'gh repo delete o/r --yes',
    'rm -rf dist',
    'git branch -D feat/x',
    'git push origin feat/retries && gh pr close 12',
  ]) assert.equal(v(cmd), 'destroys', cmd)
  assert.equal(v('git push -f', { current: 'main', defaultBranch: 'main' }), 'destroys')
  assert.equal(v('git push -f'), 'send', 'a force push to the branch you are on')
  assert.equal(v('cd ../other && git push -f'), 'destroys', 'from another folder the branch is unknown')
})

test('a command only the shell knows waits', () => {
  assert.equal(v('$G push origin main'), 'unknown')
  assert.equal(v('echo main | xargs git push origin'), 'unknown')
})

test('local work sends nothing', () => {
  assert.equal(v('npm test'), 'local')
  assert.equal(v('git commit -am "x"'), 'local')
  assert.equal(v('git push --dry-run origin main'), 'local')
  assert.equal(v('rm notes.txt'), 'local')
})

test('needsBranch spots the commands that need a branch lookup', () => {
  assert.ok(needsBranch('git push'))
  assert.ok(needsBranch('git -C x push origin y'))
  assert.ok(!needsBranch('gh pr comment 1'))
})

test('chats: Claude sends on its own, another agent asks before every change', () => {
  assert.equal(chatPermissionMode('claude'), 'auto')
  assert.equal(chatPermissionMode(undefined), 'auto')
  assert.equal(chatPermissionMode('codex'), 'gated')
})

test('selfApproval: an agent approving through junior’s API is spotted', async () => {
  const { selfApproval } = await import('../core/actions/policy.js')
  assert.ok(selfApproval(`curl -X POST http://localhost:5178/api/approvals -d '{"what":"slack-dm"}'`))
  assert.ok(selfApproval('curl -XPOST localhost:5188/api/actions/approve -d \'{"id":"x"}\''))
  assert.ok(selfApproval('curl localhost:5178/api/tasks/approve'))
  assert.ok(selfApproval('curl localhost:5178/api/actions/override'))
  assert.ok(!selfApproval('curl localhost:5178/api/actions/pending'))
  assert.ok(!selfApproval('npm test'))
})
