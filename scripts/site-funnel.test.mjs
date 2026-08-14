import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('playground emits every documented funnel event', async () => {
  const source = await readFile(
    new URL('../site/playground/playground.js', import.meta.url),
    'utf8',
  )
  for (const event of [
    'viewed',
    'edited_policy',
    'ran_call',
    'blocked',
    'approval_requested',
    'approved',
  ]) {
    assert.match(source, new RegExp(`track\\('${event}'\\)`))
  }
})

test('homepage tracks npm, GitHub, and successful CLI copy actions', async () => {
  const source = await readFile(new URL('../site/index.html', import.meta.url), 'utf8')
  assert.match(source, /trackFunnel\('site_npm_click'\)/)
  assert.match(source, /trackFunnel\('site_github_click'\)/)
  assert.match(source, /startsWith\('npx nominee-cli'\).*trackFunnel\('site_cli_copy'\)/s)
})
