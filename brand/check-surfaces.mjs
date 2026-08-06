#!/usr/bin/env node
/**
 * Validates that public-facing surfaces stay in sync with the current API.
 * Run: node brand/check-surfaces.mjs
 * Wired into CI — see .github/workflows/ci.yml
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const errors = []

function read(rel) {
  const path = join(root, rel)
  if (!existsSync(path)) {
    errors.push(`missing file: ${rel}`)
    return ''
  }
  return readFileSync(path, 'utf8')
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex')
}

// 1. llms.txt copies must match
const llmsRoot = read('llms.txt')
const llmsSite = read('site/llms.txt')
if (llmsRoot && llmsSite && sha256(llmsRoot) !== sha256(llmsSite)) {
  errors.push('llms.txt and site/llms.txt are out of sync — keep them identical')
}

const landing = read('site/index.html')
if (
  landing &&
  !landing.includes(
    'Like GitHub branch protection for agent tools.</strong> Your rules let routine',
  )
) {
  errors.push('site/index.html is missing the canonical GitHub branch-protection analogy')
}

// 2. llms.txt must mention decision-bound API and all adapter packages
const llmsRequired = [
  'nominee.run(',
  'ActionPendingError',
  'production: true',
  'nominee-openai',
  'nominee-mastra',
  'nominee-mcp',
  'nominee-postgres',
  'Your agent calls tools. Your rules decide what runs',
]
for (const needle of llmsRequired) {
  if (!llmsRoot.includes(needle)) {
    errors.push(`llms.txt missing required string: ${needle}`)
  }
}

// 3. Adapter READMEs must not claim authorize() is the execution path
const adapterReadmes = ['packages/ai/README.md', 'packages/eve/README.md']
const staleAdapterPatterns = [
  /calls `nominee\.authorize\(/,
  /calls nominee\.authorize\(/,
  /authorizes `action`/,
]
for (const rel of adapterReadmes) {
  const content = read(rel)
  for (const pattern of staleAdapterPatterns) {
    if (pattern.test(content)) {
      errors.push(`${rel} contains stale authorize() wording: ${pattern}`)
    }
  }
  if (content && !content.includes('nominee.run()')) {
    errors.push(`${rel} should describe the decision-bound run() path`)
  }
}

// 4. AGENTS.md must list sync checklist
const agents = read('AGENTS.md')
if (agents && !agents.includes('check-surfaces.mjs')) {
  errors.push('AGENTS.md should reference brand/check-surfaces.mjs in Documentation section')
}

// 5. site/docs must teach run() in the token quickstart section
const siteDocs = read('site/docs/index.html')
if (siteDocs && !siteDocs.includes('nominee.run(')) {
  errors.push('site/docs/index.html should document nominee.run()')
}
if (siteDocs?.includes('Migrating from 2.0')) {
  errors.push('site/docs/index.html nav still says "Migrating from 2.0" — should be "to 2.2"')
}

// 6. github-agent example must not reference authorize() as the execution path
const githubAgentReadme = read('examples/github-agent/README.md')
if (githubAgentReadme && /authorize\(\)/.test(githubAgentReadme)) {
  errors.push('examples/github-agent/README.md still references authorize() — use run() narrative')
}

if (errors.length > 0) {
  console.error('Public surface sync check failed:\n')
  for (const err of errors) console.error(`  ✗ ${err}`)
  console.error('\nSee brand/README.md surface registry and AGENTS.md Documentation section.')
  process.exit(1)
}

console.log('✓ public surfaces in sync')
