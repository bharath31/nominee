import assert from 'node:assert/strict'
import test from 'node:test'
import { configureCloudflareWebAnalytics } from './configure-cloudflare-web-analytics.mjs'

const accountId = 'account-id'
const projectPath = `/client/v4/accounts/${accountId}/pages/projects/nominee-dev`

function response(result, status = 200) {
  return new Response(JSON.stringify({ success: status < 400, result, errors: [] }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Cloudflare answers a token that lacks Account Analytics with exactly this shape.
function forbidden() {
  return new Response(
    JSON.stringify({
      success: false,
      result: null,
      errors: [{ code: 10000, message: 'Authentication error' }],
    }),
    { status: 403, headers: { 'Content-Type': 'application/json' } },
  )
}

test('does not mutate an already-configured Pages project', async () => {
  const requests = []
  const fetchImpl = async (url, init) => {
    requests.push({ url: new URL(url), init })
    return response({
      build_config: { web_analytics_tag: 'tag', web_analytics_token: 'token' },
    })
  }

  const result = await configureCloudflareWebAnalytics({ accountId, apiToken: 'api', fetchImpl })

  assert.equal(result.changed, false)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url.pathname, projectPath)
})

test('fails before analytics lookup when Pages is only partially configured', async () => {
  const requests = []
  const fetchImpl = async (url, init) => {
    requests.push({ url: new URL(url), init })
    return response({ build_config: { web_analytics_tag: 'tag-without-token' } })
  }

  await assert.rejects(
    configureCloudflareWebAnalytics({ accountId, apiToken: 'api', fetchImpl }),
    /partial Web Analytics configuration/,
  )
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url.pathname, projectPath)
})

test('reuses an existing Web Analytics site and attaches it to Pages', async () => {
  const requests = []
  let projectReads = 0
  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(url)
    requests.push({ url: parsed, init })

    if (parsed.pathname === projectPath && (init.method ?? 'GET') === 'GET') {
      projectReads += 1
      return response({
        build_config:
          projectReads === 1
            ? { build_command: 'pnpm build' }
            : {
                build_command: 'pnpm build',
                web_analytics_tag: 'site-tag',
                web_analytics_token: 'site-token',
              },
      })
    }
    if (parsed.pathname.endsWith('/rum/site_info/list')) {
      return response([
        {
          rules: [{ host: 'nominee.dev' }],
          site_tag: 'site-tag',
          site_token: 'site-token',
        },
      ])
    }
    if (parsed.pathname === projectPath && init.method === 'PATCH') {
      const body = JSON.parse(init.body)
      assert.deepEqual(body.build_config, {
        build_command: 'pnpm build',
        web_analytics_tag: 'site-tag',
        web_analytics_token: 'site-token',
      })
      return response({})
    }
    throw new Error(`Unexpected request: ${init.method ?? 'GET'} ${parsed.pathname}`)
  }

  const result = await configureCloudflareWebAnalytics({ accountId, apiToken: 'api', fetchImpl })

  assert.equal(result.changed, true)
  assert.equal(
    requests.some(({ init }) => init.method === 'POST'),
    false,
  )
})

test('creates a Web Analytics site when none exists', async () => {
  const requests = []
  let projectReads = 0
  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(url)
    requests.push({ url: parsed, init })

    if (parsed.pathname === projectPath && (init.method ?? 'GET') === 'GET') {
      projectReads += 1
      return response({
        build_config:
          projectReads === 1
            ? {}
            : { web_analytics_tag: 'new-tag', web_analytics_token: 'new-token' },
      })
    }
    if (parsed.pathname.endsWith('/rum/site_info/list')) return response([])
    if (parsed.pathname.endsWith('/rum/site_info') && init.method === 'POST') {
      assert.deepEqual(JSON.parse(init.body), { auto_install: false, host: 'nominee.dev' })
      return response({ site_tag: 'new-tag', site_token: 'new-token' })
    }
    if (parsed.pathname === projectPath && init.method === 'PATCH') return response({})
    throw new Error(`Unexpected request: ${init.method ?? 'GET'} ${parsed.pathname}`)
  }

  const result = await configureCloudflareWebAnalytics({ accountId, apiToken: 'api', fetchImpl })

  assert.equal(result.changed, true)
  assert.equal(
    requests.some(({ init }) => init.method === 'POST'),
    true,
  )
})

test('skips instead of failing when the token cannot reach Web Analytics', async () => {
  const requests = []
  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(url)
    requests.push({ url: parsed, init })

    if (parsed.pathname === projectPath && (init.method ?? 'GET') === 'GET') {
      return response({ build_config: {} })
    }
    if (parsed.pathname.includes('/rum/')) return forbidden()
    throw new Error(`Unexpected request: ${init.method ?? 'GET'} ${parsed.pathname}`)
  }

  const result = await configureCloudflareWebAnalytics({ accountId, apiToken: 'api', fetchImpl })

  assert.equal(result.skipped, true)
  assert.equal(result.changed, false)
  assert.match(result.reason, /Account Analytics/)
  // A skip must never half-configure the Pages project.
  assert.equal(
    requests.some(({ init }) => init.method === 'PATCH'),
    false,
  )
})

test('still fails when the Pages project itself cannot be read', async () => {
  const fetchImpl = async () => forbidden()

  await assert.rejects(
    configureCloudflareWebAnalytics({ accountId, apiToken: 'api', fetchImpl }),
    /pages\/projects\/nominee-dev/,
  )
})
