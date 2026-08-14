#!/usr/bin/env node
// Reproducible acquisition baseline. npm's per-day minimum across every
// nominee package is treated as automated monorepo traffic and subtracted
// before totals are printed. This is an estimate, never an activation count.
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

  let rawDownloads = 0
  let estimatedHumanDownloads = 0
  for (const day of days) {
    const counts = indexed.map(({ name, byDay }) => {
      const count = byDay.get(day)
      if (count === undefined) throw new Error(`npm omitted ${day} from the series for ${name}`)
      return count
    })
    const floor = Math.min(...counts)
    rawDownloads += counts.reduce((sum, count) => sum + count, 0)
    estimatedHumanDownloads += counts.reduce((sum, count) => sum + Math.max(0, count - floor), 0)
  }

  return {
    period: { start, end },
    packages: indexed.map(({ name }) => name),
    rawDownloads,
    estimatedAutomatedFloor: rawDownloads - estimatedHumanDownloads,
    estimatedHumanDownloads,
    warning: 'Download figures are an acquisition estimate, not activated developers.',
  }
}

async function main() {
  const end = process.argv[3] ?? new Date().toISOString().slice(0, 10)
  const start =
    process.argv[2] ??
    new Date(Date.parse(`${end}T00:00:00Z`) - 6 * 864e5).toISOString().slice(0, 10)
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

  console.log(JSON.stringify(summarizeDownloadSeries(series, start, end), null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
