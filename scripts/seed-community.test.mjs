import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const seed = JSON.parse(
  await readFile(new URL('../.github/community/seed.json', import.meta.url), 'utf8'),
)

test('community seed satisfies NOM-2 backlog and discussion bounds', () => {
  assert.ok(seed.issues.length >= 8, 'expected at least 8 contributor issues')
  assert.ok(seed.issues.length <= 12, 'expected at most 12 contributor issues')
  assert.ok(seed.discussions.length >= 3, 'expected at least 3 discussion threads')

  const issueTitles = seed.issues.map((issue) => issue.title)
  const discussionTitles = seed.discussions.map((discussion) => discussion.title)
  assert.equal(new Set(issueTitles).size, issueTitles.length, 'issue titles must be unique')
  assert.equal(
    new Set(discussionTitles).size,
    discussionTitles.length,
    'discussion titles must be unique',
  )
})
