/**
 * The two shell checks behind the Autonomy levels: what runs alone at
 * "Asks before commands", and what still asks at "Asks before sending".
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { destructiveCommand, readOnlyCommand } from '../core/actions/commands.js'

test('read-only commands run alone', () => {
  for (const cmd of [
    'git status',
    'git log --oneline -20',
    'git diff HEAD~1',
    'gh pr view 12',
    'ls -la web/src',
    'cat package.json',
    'head -40 server/index.ts',
    'grep -rn "autonomy" web/src',
    'rg permissionMode',
    'find . -name "*.ts"',
    'pwd',
  ]) assert.equal(readOnlyCommand(cmd), true, cmd)
})

test('anything else, or anything attached, asks', () => {
  for (const cmd of [
    'npm install',
    'npm test',
    'git commit -m x',
    'git push',
    'gh pr comment 12 -b hi',
    'ls; rm -rf x',
    'ls && rm -rf x',
    'cat a > b',
    'grep x $(rm -rf y)',
    'ls `rm -rf y`',
    'cat a\nrm -rf b',
    'find . -name x -delete',
    'find . -exec rm {} +',
    'lsof -i :5188',
    'catalog',
  ]) assert.equal(readOnlyCommand(cmd), false, cmd)
})

test('destructive commands are caught, chained or not', () => {
  for (const cmd of [
    'rm -rf dist',
    'rm -r tmp',
    'rm -fR build',
    'rm --recursive x',
    'npm run build && rm -rf node_modules',
    'sudo rm -rf /tmp/x',
    'git reset --hard HEAD~2',
    'git clean -fd',
    'git checkout -- .',
    'git restore .',
    'git branch -D feat/x',
    'git branch -d merged',
    'git branch --delete old',
    'git tag -d v1',
    'git push origin --delete feat/x',
    'git push origin :feat/x',
    'git push --mirror backup',
    'git push --force origin main',
    'git push -f origin HEAD:master',
    'gh pr close 12',
    'gh -R o/r issue close 3',
    'gh issue delete 4',
    'gh repo delete o/r --yes',
    'gh release delete v1',
    'gh api -X DELETE repos/o/r/git/refs/heads/x',
    'gh api --method=delete repos/o/r',
    'find . -name "*.log" -delete',
    'rmdir build',
    'git rm -r old',
    'git stash drop',
    'git stash clear',
    'dropdb junior',
    'psql -c "DROP TABLE users"',
    'sqlite3 x.db "truncate table t"',
    'bash -c "git reset --hard"',
    'echo $(rm -rf x)',
  ]) assert.ok(destructiveCommand(cmd), cmd)
})

test('ordinary work is not destructive', () => {
  for (const cmd of [
    'rm notes.txt',
    'npm test',
    'git reset HEAD file.ts',
    'git checkout main',
    'git stash',
    'git stash pop',
    'git clean -n',
    'echo "drop it"',
    'git push origin main',
    'git push --force origin feat/x',
    'git push --force-with-lease origin HEAD:feat/x',
    'gh pr merge 12 --squash --delete-branch',
    'gh pr comment 12 --body "looks good"',
    'gh pr create --title x --body y',
    'git rm old.ts',
  ]) assert.equal(destructiveCommand(cmd), null, cmd)
})

test('a force push to the checked-out branch is judged against where the shell stands', () => {
  assert.equal(destructiveCommand('git push --force', { current: 'feat/x', defaultBranch: 'main' }), null)
  assert.ok(destructiveCommand('git push --force', { current: 'main', defaultBranch: 'main' }))
  assert.ok(destructiveCommand('git push -f', { current: null, defaultBranch: null }))
  assert.ok(destructiveCommand('cd ../other && git push -f', { current: 'feat/x', defaultBranch: 'main' }))
})
