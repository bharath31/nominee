#!/usr/bin/env node
// Reproducible acquisition baseline. npm's per-day minimum across every
// nominee package is treated as automated monorepo traffic and subtracted
// before totals are printed. This is an estimate, never an activation count.
import { readFile, readdir } from 'node:fs/promises'

const end = process.argv[3] ?? new Date().toISOString().slice(0, 10)
const start =
  process.argv[2] ?? new Date(Date.parse(`${end}T00:00:00Z`) - 6 * 864e5).toISOString().slice(0, 10)
const packageDirs = await readdir(new URL('../packages/', import.meta.url), { withFileTypes: true })
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
    return { name, downloads: (await response.json()).downloads }
  }),
)

const days = series[0]?.downloads.map(({ day }) => day) ?? []
let raw = 0
let adjusted = 0
for (let index = 0; index < days.length; index += 1) {
  const counts = series.map(({ downloads }) => downloads[index]?.downloads ?? 0)
  const floor = Math.min(...counts)
  raw += counts.reduce((sum, count) => sum + count, 0)
  adjusted += counts.reduce((sum, count) => sum + Math.max(0, count - floor), 0)
}

console.log(
  JSON.stringify(
    {
      period: { start, end },
      packages,
      rawDownloads: raw,
      estimatedAutomatedFloor: raw - adjusted,
      estimatedHumanDownloads: adjusted,
      warning: 'Download figures are an acquisition estimate, not activated developers.',
    },
    null,
    2,
  ),
)
