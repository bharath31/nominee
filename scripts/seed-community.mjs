#!/usr/bin/env node
/**
 * Enable GitHub Discussions (admin), then create seeded threads and issues
 * from .github/community/seed.json. Idempotent on title match. Re-runs
 * reopen closed seed issues and apply any labels still missing from seed.json.
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

let failed = false

function fail(message, error) {
  failed = true
  console.error(message)
  if (error) console.error(String(error.stderr ?? error.message ?? error))
}

function ghJson(args) {
  const out = execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  return out.trim() ? JSON.parse(out) : null
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8' })
}

function labelNames(issue) {
  return new Set((issue.labels ?? []).map((label) => label.name ?? label))
}

console.log(`Seeding ${repo}`)

try {
  gh(['api', '-X', 'PATCH', `repos/${repo}`, '-f', 'has_discussions=true'])
  console.log('✓ Discussions enabled')
} catch (error) {
  fail('✗ Could not enable Discussions (needs admin).', error)
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
  'number,title,url,state,labels',
])
const byTitle = new Map((existingIssues ?? []).map((issue) => [issue.title, issue]))

for (const issue of seed.issues) {
  const wanted = issue.labels ?? []
  const existing = byTitle.get(issue.title)
  if (existing) {
    try {
      if (existing.state === 'CLOSED') {
        gh(['issue', 'reopen', '-R', repo, String(existing.number)])
        console.log(`✓ reopened #${existing.number}`)
      }
      const have = labelNames(existing)
      const missing = wanted.filter((label) => !have.has(label))
      if (missing.length > 0) {
        const args = ['issue', 'edit', '-R', repo, String(existing.number)]
        for (const label of missing) args.push('--add-label', label)
        gh(args)
        console.log(`✓ labels on #${existing.number}: ${missing.join(', ')}`)
      } else {
        console.log(`skip issue (exists, labels current): ${issue.title}`)
      }
    } catch (error) {
      fail(`✗ reconcile "${issue.title}" (#${existing.number})`, error)
    }
    continue
  }

  const args = ['issue', 'create', '-R', repo, '--title', issue.title, '--body', issue.body]
  for (const label of wanted) args.push('--label', label)
  try {
    const url = gh(args).trim()
    console.log(`✓ issue ${url}`)
  } catch (error) {
    fail(`✗ issue "${issue.title}"`, error)
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
  fail('✗ GraphQL (Discussions). Enable Discussions in the repo settings, then re-run.', error)
  process.exit(1)
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
let repoId
try {
  repoId = ghJson([
    'api',
    'graphql',
    '-f',
    `query=${repoIdQuery}`,
    '-F',
    `owner=${owner}`,
    '-F',
    `name=${name}`,
  ])?.data?.repository?.id
} catch (error) {
  fail('✗ GraphQL repository id', error)
}

for (const thread of seed.discussions) {
  if (existingDiscussions.has(thread.title)) {
    console.log(`skip discussion (exists): ${thread.title}`)
    continue
  }
  const category = categories.find((c) => c.name.toLowerCase() === thread.category.toLowerCase())
  if (!category || !repoId) {
    fail(
      `✗ no category "${thread.category}" (have: ${categories.map((c) => c.name).join(', ') || 'none — enable Discussions'})`,
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
    if (!url) {
      fail(`✗ discussion "${thread.title}": mutation returned no URL`)
      continue
    }
    console.log(`✓ discussion ${url}`)
  } catch (error) {
    fail(`✗ discussion "${thread.title}"`, error)
  }
}

if (failed) {
  console.error('Seed finished with errors.')
  process.exit(1)
}
console.log('Seed finished.')
