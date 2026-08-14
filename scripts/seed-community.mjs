#!/usr/bin/env node
/**
 * Enable GitHub Discussions (admin), then create seeded threads and issues
 * from .github/community/seed.json. Idempotent on title match.
 *
 *   GH_TOKEN=<repo+discussions scope> node scripts/seed-community.mjs
 *
 * The Cursor cloud token is contents-only; a maintainer PAT or the
 * workflow_dispatch job in .github/workflows/seed-community.yml is required.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const repo = process.env.GITHUB_REPOSITORY ?? 'bharath31/nominee'
const [owner, name] = repo.split('/')
const seed = JSON.parse(readFileSync(join(root, '.github/community/seed.json'), 'utf8'))

function ghJson(args) {
  const out = execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  return out.trim() ? JSON.parse(out) : null
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8' })
}

console.log(`Seeding ${repo}`)

try {
  gh(['api', '-X', 'PATCH', `repos/${repo}`, '-f', 'has_discussions=true'])
  console.log('✓ Discussions enabled')
} catch (error) {
  console.error('✗ Could not enable Discussions (needs admin). Seed issues anyway.')
  console.error(String(error.stderr ?? error.message))
}

const existingIssues = ghJson([
  'issue',
  'list',
  '-R',
  repo,
  '--state',
  'all',
  '--limit',
  '100',
  '--json',
  'title,url,state',
])
const issueTitles = new Set((existingIssues ?? []).map((issue) => issue.title))

for (const issue of seed.issues) {
  if (issueTitles.has(issue.title)) {
    console.log(`skip issue (exists): ${issue.title}`)
    continue
  }
  const args = ['issue', 'create', '-R', repo, '--title', issue.title, '--body', issue.body]
  for (const label of issue.labels ?? []) {
    args.push('--label', label)
  }
  try {
    const url = gh(args).trim()
    console.log(`✓ issue ${url}`)
  } catch (error) {
    console.error(`✗ issue "${issue.title}": ${error.stderr ?? error.message}`)
  }
}

const categoryQuery = `
query ($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    discussionCategories(first: 20) {
      nodes { id name }
    }
    discussions(first: 50) { nodes { title url } }
  }
}`

let repoData
try {
  repoData = ghJson([
    'api',
    'graphql',
    '-f',
    `query=${categoryQuery}`,
    '-F',
    `owner=${owner}`,
    '-F',
    `name=${name}`,
  ])
} catch (error) {
  console.error('✗ GraphQL (Discussions). Enable Discussions in the repo settings, then re-run.')
  console.error(String(error.stderr ?? error.message))
  process.exitCode = 1
  process.exit()
}

const categories = repoData?.data?.repository?.discussionCategories?.nodes ?? []
const existingDiscussions = new Set(
  (repoData?.data?.repository?.discussions?.nodes ?? []).map((d) => d.title),
)

const createDiscussion = `
mutation ($repoId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
  createDiscussion(input: { repositoryId: $repoId, categoryId: $categoryId, title: $title, body: $body }) {
    discussion { url title }
  }
}`

const repoIdQuery = `
query ($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) { id }
}`
const repoId = ghJson([
  'api',
  'graphql',
  '-f',
  `query=${repoIdQuery}`,
  '-F',
  `owner=${owner}`,
  '-F',
  `name=${name}`,
])?.data?.repository?.id

for (const thread of seed.discussions) {
  if (existingDiscussions.has(thread.title)) {
    console.log(`skip discussion (exists): ${thread.title}`)
    continue
  }
  const category = categories.find((c) => c.name.toLowerCase() === thread.category.toLowerCase())
  if (!category || !repoId) {
    console.error(
      `✗ no category "${thread.category}" (have: ${categories.map((c) => c.name).join(', ')})`,
    )
    continue
  }
  try {
    const created = ghJson([
      'api',
      'graphql',
      '-f',
      `query=${createDiscussion}`,
      '-F',
      `repoId=${repoId}`,
      '-F',
      `categoryId=${category.id}`,
      '-F',
      `title=${thread.title}`,
      '-F',
      `body=${thread.body}`,
    ])
    const url = created?.data?.createDiscussion?.discussion?.url
    console.log(`✓ discussion ${url ?? thread.title}`)
  } catch (error) {
    console.error(`✗ discussion "${thread.title}": ${error.stderr ?? error.message}`)
  }
}
