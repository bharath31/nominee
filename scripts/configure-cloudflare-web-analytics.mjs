#!/usr/bin/env node

import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const API_ROOT = 'https://api.cloudflare.com/client/v4'

const ANALYTICS_PERMISSION_HINT =
  'The Cloudflare API token needs the account-level Account Analytics permission ' +
  '(Read to reuse an existing site, Edit to create one).'

function errorMessages(body) {
  const errors = Array.isArray(body?.errors) ? body.errors : []
  return errors.map((error) => error.message ?? String(error)).join('; ')
}

// Cloudflare answers a token that is valid but under-scoped with 403 / code 10000,
// which is indistinguishable from a bad token by message alone.
function isPermissionError(error) {
  return error?.status === 401 || error?.status === 403
}

async function cloudflareRequest({ accountId, apiToken, fetchImpl }, path, init = {}) {
  const response = await fetchImpl(`${API_ROOT}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
  const body = await response.json()

  if (!response.ok || body.success !== true) {
    const detail = errorMessages(body) || `HTTP ${response.status}`
    const permissionHint = path.includes('/rum/') ? ` ${ANALYTICS_PERMISSION_HINT}` : ''
    const error = new Error(`Cloudflare request failed for ${path}: ${detail}.${permissionHint}`)
    error.status = response.status
    error.path = path
    throw error
  }

  return body.result
}

function siteMatchesHost(site, host) {
  if (site?.ruleset?.zone_name === host) return true
  return site?.rules?.some((rule) => rule.host === host) ?? false
}

export async function configureCloudflareWebAnalytics({
  accountId,
  apiToken,
  projectName = 'nominee-dev',
  host = 'nominee.dev',
  fetchImpl = fetch,
}) {
  if (!accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID is required')
  if (!apiToken) throw new Error('CLOUDFLARE_API_TOKEN is required')

  const client = { accountId, apiToken, fetchImpl }
  const projectPath = `/accounts/${accountId}/pages/projects/${projectName}`
  const project = await cloudflareRequest(client, projectPath)
  const currentBuildConfig = project.build_config ?? {}
  const hasAnalyticsTag = Boolean(currentBuildConfig.web_analytics_tag)
  const hasAnalyticsToken = Boolean(currentBuildConfig.web_analytics_token)

  if (hasAnalyticsTag !== hasAnalyticsToken) {
    throw new Error(
      `Cloudflare Pages project ${projectName} has a partial Web Analytics configuration`,
    )
  }

  if (hasAnalyticsTag && hasAnalyticsToken) {
    return { changed: false, skipped: false, projectName, host }
  }

  // Analytics is a nice-to-have; an under-scoped token must never block the deploy.
  let site
  try {
    const sites = await cloudflareRequest(
      client,
      `/accounts/${accountId}/rum/site_info/list?per_page=50`,
    )
    site = sites.find((candidate) => siteMatchesHost(candidate, host))

    if (!site) {
      site = await cloudflareRequest(client, `/accounts/${accountId}/rum/site_info`, {
        method: 'POST',
        body: JSON.stringify({ auto_install: false, host }),
      })
    }
  } catch (error) {
    if (!isPermissionError(error)) throw error
    return { changed: false, skipped: true, projectName, host, reason: ANALYTICS_PERMISSION_HINT }
  }

  if (!site?.site_tag || !site?.site_token) {
    throw new Error(`Cloudflare Web Analytics did not return a tag and token for ${host}`)
  }

  await cloudflareRequest(client, projectPath, {
    method: 'PATCH',
    body: JSON.stringify({
      build_config: {
        ...currentBuildConfig,
        web_analytics_tag: site.site_tag,
        web_analytics_token: site.site_token,
      },
    }),
  })

  const updatedProject = await cloudflareRequest(client, projectPath)
  if (
    !updatedProject.build_config?.web_analytics_tag ||
    !updatedProject.build_config?.web_analytics_token
  ) {
    throw new Error(`Cloudflare Web Analytics was not attached to Pages project ${projectName}`)
  }

  return { changed: true, skipped: false, projectName, host }
}

async function main() {
  const result = await configureCloudflareWebAnalytics({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    projectName: process.env.CLOUDFLARE_PAGES_PROJECT ?? 'nominee-dev',
    host: process.env.CLOUDFLARE_WEB_ANALYTICS_HOST ?? 'nominee.dev',
  })

  if (result.skipped) {
    console.log(
      `::warning::Skipped Cloudflare Web Analytics for ${result.host}: ${result.reason} The site still deploys without it.`,
    )
    return
  }

  const verb = result.changed ? 'Enabled' : 'Already enabled'
  console.log(`${verb}: Cloudflare Web Analytics for ${result.host} on ${result.projectName}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
