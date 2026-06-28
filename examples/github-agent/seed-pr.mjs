#!/usr/bin/env node
// Open a fresh PR to act on in the demo. Creates a public testbed repo on YOUR
// GitHub account the first time, then opens a new PR each run (merging closes
// the PR, so re-run for another round).
//
//   pnpm seed                       → <your-username>/nominee-agent-testbed
//   TESTBED_REPO=owner/repo pnpm seed  → use an existing repo you own
import { execFileSync } from 'node:child_process'

const gh = (args) => execFileSync('gh', args, { encoding: 'utf8' }).trim()
const ghJson = (args) => JSON.parse(gh(args))

const login = ghJson(['api', 'user']).login
const REPO = process.env.TESTBED_REPO || `${login}/nominee-agent-testbed`

// Create the testbed repo on first run.
let exists = true
try {
  gh(['api', `repos/${REPO}`])
} catch {
  exists = false
}
if (!exists) {
  console.log(`Creating testbed repo ${REPO}…`)
  gh([
    'repo',
    'create',
    REPO,
    '--public',
    '--add-readme',
    '-d',
    'Testbed for the nominee github-agent demo',
  ])
  // Give GitHub a moment to initialize the default branch.
  await new Promise((r) => setTimeout(r, 3000))
}

const sha = ghJson(['api', `repos/${REPO}/git/ref/heads/main`]).object.sha
const br = `demo-pr-${Date.now()}`
gh(['api', `repos/${REPO}/git/refs`, '-f', `ref=refs/heads/${br}`, '-f', `sha=${sha}`])
const content = Buffer.from(
  '# Flaky test fix\n\nStabilize retry timing in the integration suite.\n',
).toString('base64')
gh([
  'api',
  `repos/${REPO}/contents/FIX-${br}.md`,
  '-X',
  'PUT',
  '-f',
  'message=Fix flaky integration test',
  '-f',
  `branch=${br}`,
  '-f',
  `content=${content}`,
])
const url = gh([
  'pr',
  'create',
  '--repo',
  REPO,
  '--base',
  'main',
  '--head',
  br,
  '--title',
  'Fix flaky integration test',
  '--body',
  'Demo PR for the nominee github-agent.',
])

const number = url.split('/').pop()
console.log(`\nOpened ${url}`)
console.log(`Now tell the agent:  review PR #${number} on ${REPO}\n`)
