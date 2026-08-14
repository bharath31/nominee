#!/usr/bin/env node
// Reproducible weekly funnel report. npm's per-day minimum across every
// nominee package is treated as automated monorepo traffic and subtracted
// from the core `nominee` package. Analytics counts are accepted only as an
// explicit aggregate export; absent data stays unavailable rather than zero.
import { readFile, readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

function dateRange(start, end) {
  const startAt = Date.parse(`${start}T00:00:00Z`)
  const endAt = Date.parse(`${end}T00:00:00Z`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
    !Number.isFinite(startAt) ||
    !Number.isFinite(endAt) ||
    new Date(startAt).toISOString().slice(0, 10) !== start ||
    new Date(endAt).toISOString().slice(0, 10) !== end ||
    startAt > endAt
  ) {
    throw new Error(`invalid report period: ${start} through ${end}`)
  }

  const days = []
  for (let at = startAt; at <= endAt; at += 864e5) {
    days.push(new Date(at).toISOString().slice(0, 10))
  }
  return days
}

/** Align npm package series by their explicit day field and fail on missing coverage. */
export function summarizeDownloadSeries(series, start, end) {
  const days = dateRange(start, end)
  if (series.length === 0) throw new Error('no published packages found')

  const indexed = series.map(({ name, downloads }) => {
    if (!Array.isArray(downloads)) throw new Error(`npm returned no download series for ${name}`)
    const byDay = new Map()
    for (const entry of downloads) {
      if (
        !entry ||
        typeof entry.day !== 'string' ||
        typeof entry.downloads !== 'number' ||
        !Number.isFinite(entry.downloads) ||
        entry.downloads < 0
      ) {
        throw new Error(`npm returned an invalid download entry for ${name}`)
      }
      if (byDay.has(entry.day))
        throw new Error(`npm returned duplicate day ${entry.day} for ${name}`)
      byDay.set(entry.day, entry.downloads)
    }
    return { name, byDay }
  })

  const core = indexed.find(({ name }) => name === 'nominee')
  if (!core) throw new Error('npm series does not include the core nominee package')

  let rawCoreDownloads = 0
  let estimatedAutomatedFloor = 0
  let mirrorAdjustedInstalls = 0
  for (const day of days) {
    const counts = indexed.map(({ name, byDay }) => {
      const count = byDay.get(day)
      if (count === undefined) throw new Error(`npm omitted ${day} from the series for ${name}`)
      return count
    })
    const floor = Math.min(...counts)
    const coreDownloads = core.byDay.get(day)
    if (coreDownloads === undefined)
      throw new Error(`npm omitted ${day} from the series for nominee`)
    rawCoreDownloads += coreDownloads
    estimatedAutomatedFloor += floor
    mirrorAdjustedInstalls += Math.max(0, coreDownloads - floor)
  }

  return {
    period: { start, end },
    packages: indexed.map(({ name }) => name),
    mirrorAdjustedInstalls,
    diagnostics: { rawCoreDownloads, estimatedAutomatedFloor },
    warning:
      'Mirror-adjusted installs are an acquisition estimate, not activated developers. Raw downloads are diagnostic only.',
  }
}

function nonNegativeInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`analytics ${field} must be a non-negative integer`)
  }
  return value
}

/** Validate an aggregate export. It must not contain identifiers or raw events. */
export function parseAnalyticsCounts(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('analytics export must be a JSON object')
  }
  const allowed = new Set(['trials', 'activatedDevelopers', 'previousActivatedDevelopers'])
  const unknown = Object.keys(input).filter((key) => !allowed.has(key))
  if (unknown.length) {
    throw new Error(`analytics export contains unsupported field(s): ${unknown.join(', ')}`)
  }
  return {
    trials: nonNegativeInteger(input.trials, 'trials'),
    activatedDevelopers: nonNegativeInteger(input.activatedDevelopers, 'activatedDevelopers'),
    previousActivatedDevelopers: nonNegativeInteger(
      input.previousActivatedDevelopers,
      'previousActivatedDevelopers',
    ),
  }
}

function percent(numerator, denominator) {
  if (denominator === 0) return null
  return Math.round((numerator / denominator) * 10_000) / 100
}

/** Combine acquisition and aggregate funnel counts into the five-number dashboard. */
export function buildWeeklyActivationReport(downloads, analytics) {
  const activated = analytics?.activatedDevelopers ?? null
  const previous = analytics?.previousActivatedDevelopers ?? null
  return {
    period: downloads.period,
    metrics: {
      trials: analytics?.trials ?? null,
      mirrorAdjustedInstalls: downloads.mirrorAdjustedInstalls,
      activatedDevelopersThisWeek: activated,
      activationRatePercent:
        activated === null ? null : percent(activated, downloads.mirrorAdjustedInstalls),
      activatedWeekOverWeekPercent:
        activated === null || previous === null ? null : percent(activated - previous, previous),
    },
    analyticsStatus: analytics
      ? previous === 0
        ? 'measured; week-over-week is unavailable when the previous count is zero'
        : 'measured from an explicit aggregate export'
      : 'unavailable; pass --analytics <aggregate-counts.json> after FUNNEL is enabled',
    diagnostics: downloads.diagnostics,
    warning: downloads.warning,
  }
}

/** The latest UTC date whose full 24-hour window has elapsed. */
export function previousCompletedUtcDay(now = Date.now()) {
  return new Date(now - 864e5).toISOString().slice(0, 10)
}

async function main() {
  const args = process.argv.slice(2)
  const analyticsIndex = args.indexOf('--analytics')
  const analyticsFile = analyticsIndex === -1 ? undefined : args[analyticsIndex + 1]
  if (analyticsIndex !== -1 && !analyticsFile) {
    throw new Error('usage: weekly-activation-report.mjs [start] [end] [--analytics file.json]')
  }
  const dates = [...args]
  if (analyticsIndex !== -1) dates.splice(analyticsIndex, 2)
  if (dates.length > 2) {
    throw new Error('usage: weekly-activation-report.mjs [start] [end] [--analytics file.json]')
  }
  const end = dates[1] ?? previousCompletedUtcDay()
  const start =
    dates[0] ?? new Date(Date.parse(`${end}T00:00:00Z`) - 6 * 864e5).toISOString().slice(0, 10)
  const packageDirs = await readdir(new URL('../packages/', import.meta.url), {
    withFileTypes: true,
  })
  const packages = (
    await Promise.all(
      packageDirs
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const manifest = JSON.parse(
            await readFile(
              new URL(`../packages/${entry.name}/package.json`, import.meta.url),
              'utf8',
            ),
          )
          return manifest.private ? null : manifest.name
        }),
    )
  ).filter(Boolean)

  const series = await Promise.all(
    packages.map(async (name) => {
      const response = await fetch(
        `https://api.npmjs.org/downloads/range/${start}:${end}/${encodeURIComponent(name)}`,
      )
      if (!response.ok) throw new Error(`npm returned ${response.status} for ${name}`)
      const body = await response.json()
      return { name, downloads: body.downloads }
    }),
  )

  const downloads = summarizeDownloadSeries(series, start, end)
  const analytics = analyticsFile
    ? parseAnalyticsCounts(JSON.parse(await readFile(analyticsFile, 'utf8')))
    : undefined
  console.log(JSON.stringify(buildWeeklyActivationReport(downloads, analytics), null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
