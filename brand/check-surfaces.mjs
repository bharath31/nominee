#!/usr/bin/env node
/**
 * Validates that public-facing surfaces stay in sync with the current API.
 * Run: node brand/check-surfaces.mjs
 * Wired into CI — see .github/workflows/ci.yml
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
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
const landingHero = landing.match(/<h1>[\s\S]*?<\/h1>/)
if (
  !landingHero ||
  !/Find out what your agent\s*<br\s*\/?>\s*can actually do\./.test(landingHero[0])
) {
  errors.push('site/index.html <h1> should lead with the discovery headline')
}
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
  'Find out what your agent can actually do',
  'Your agent calls tools. Your rules decide what runs',
]

const readme = read('README.md')
if (readme && !readme.startsWith('<p align="center">')) {
  errors.push('README.md should still open with the banner')
}
const discoveryIdx = readme.indexOf('Find out what your agent can actually do')
const proofIdx = readme.indexOf('npx nominee-cli\n')
const ifIdx = readme.indexOf('Why add it instead of an `if`')
if (discoveryIdx < 0) errors.push('README.md missing discovery lead')
if (discoveryIdx > 0 && proofIdx > 0 && discoveryIdx > proofIdx) {
  errors.push('README.md should lead with observe/discovery before the refund proof')
}
if (ifIdx > 0 && proofIdx > 0 && ifIdx < proofIdx) {
  errors.push('README.md should move "Why add it instead of an if" after the proof')
}
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

// 7. Prohibited overclaims (docs/positioning.md). Allowed only when the same
// sentence negates the phrase — site/blog is included because that is where
// overclaims hurt most.
const PROHIBITED_CLAIMS = [/tamper-proof/gi, /compliance-ready/gi, /stops prompt injection/gi]
function claimNegationGoverns(sentence, phrase) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const gap = String.raw`[\s"'“”‘’:,-]{0,12}`
  const before = new RegExp(
    String.raw`\b(?:not|never|won't|will not|do not|don't|isn't|is not|aren't|are not|cannot|can't|without)\b${gap}${escaped}`,
    'i',
  )
  const after = new RegExp(
    String.raw`${escaped}${gap}(?:is not|isn't|are not|aren't|cannot|can't|won't)\b`,
    'i',
  )
  const wontUse = new RegExp(String.raw`we won't use (?:it|${escaped})`, 'i')
  return before.test(sentence) || after.test(sentence) || wontUse.test(sentence)
}

function walkFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === 'dist' || ent.name === '.git') continue
    const p = join(dir, ent.name)
    if (ent.isDirectory()) walkFiles(p, acc)
    else acc.push(p)
  }
  return acc
}

function sentenceAround(text, index) {
  const before = [
    text.lastIndexOf('.', index),
    text.lastIndexOf('!', index),
    text.lastIndexOf('?', index),
    text.lastIndexOf('\n', index),
  ].filter((i) => i >= 0)
  const start = before.length === 0 ? 0 : Math.max(...before) + 1
  const rest = text.slice(index)
  const relEnds = [
    rest.indexOf('.'),
    rest.indexOf('!'),
    rest.indexOf('?'),
    rest.indexOf('\n'),
  ].filter((n) => n !== -1)
  const end = relEnds.length === 0 ? text.length : index + Math.min(...relEnds) + 1
  return text.slice(start, end)
}

const claimFiles = [
  ...walkFiles(join(root, 'site', 'blog')).filter((p) => p.endsWith('.html') || p.endsWith('.md')),
  ...walkFiles(root).filter((p) => p.endsWith('README.md')),
]
for (const abs of claimFiles) {
  const content = readFileSync(abs, 'utf8')
  const rel = relative(root, abs)
  for (const pattern of PROHIBITED_CLAIMS) {
    pattern.lastIndex = 0
    let match = pattern.exec(content)
    while (match) {
      const sentence = sentenceAround(content, match.index)
      if (!claimNegationGoverns(sentence, match[0])) {
        errors.push(
          `${rel} uses prohibited claim "${match[0]}" without negation: ${sentence.trim().slice(0, 120)}`,
        )
      }
      match = pattern.exec(content)
    }
  }
}

if (!existsSync(join(root, 'site/docs/mcp/index.html'))) {
  errors.push('missing site/docs/mcp/index.html — MCP quickstart must be a public page')
}
const mcpPage = read('site/docs/mcp/index.html')
if (mcpPage && !mcpPage.includes('MCP OAuth authorizes the connection')) {
  errors.push('site/docs/mcp/index.html should contrast MCP OAuth with action authorization')
}
if (mcpPage && /stops prompt injection/i.test(mcpPage)) {
  errors.push('site/docs/mcp/index.html must not claim nominee stops prompt injection')
}

if (errors.length > 0) {
  console.error('Public surface sync check failed:\n')
  for (const err of errors) console.error(`  ✗ ${err}`)
  console.error('\nSee brand/README.md surface registry and AGENTS.md Documentation section.')
  process.exit(1)
}

console.log('✓ public surfaces in sync')
