import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { closeGitHubIssue } from '../src/backend.js'

describe('OpenAI Support Agent', () => {
  test('closes an issue through the fake backend', async () => {
    const result = await closeGitHubIssue({ repo: 'acme/widgets', issue: 42 })

    assert.equal(result, 'Issue #42 closed on acme/widgets')
  })
})
