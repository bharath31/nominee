import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildWeeklyActivationReport,
  parseAnalyticsCounts,
  previousCompletedUtcDay,
  summarizeDownloadSeries,
} from './weekly-activation-report.mjs'

test('defaults to the previous completed UTC day', () => {
  assert.equal(previousCompletedUtcDay(Date.UTC(2026, 7, 14, 23, 59)), '2026-08-13')
})

test('subtracts the daily ten-package mirror floor from core downloads only', () => {
  const report = summarizeDownloadSeries(
    [
      {
        name: 'nominee',
        downloads: [
          { day: '2026-08-03', downloads: 10 },
          { day: '2026-08-04', downloads: 20 },
        ],
      },
      {
        name: 'nominee-cli',
        downloads: [
          { day: '2026-08-04', downloads: 7 },
          { day: '2026-08-03', downloads: 5 },
        ],
      },
      {
        name: 'nominee-ai',
        downloads: [
          { day: '2026-08-03', downloads: 8 },
          { day: '2026-08-04', downloads: 11 },
        ],
      },
    ],
    '2026-08-03',
    '2026-08-04',
  )

  assert.equal(report.diagnostics.rawCoreDownloads, 30)
  assert.equal(report.diagnostics.estimatedAutomatedFloor, 12)
  assert.equal(report.mirrorAdjustedInstalls, 18)
})

test('builds the documented five metrics from explicit aggregate counts', () => {
  const report = buildWeeklyActivationReport(
    {
      period: { start: '2026-08-03', end: '2026-08-09' },
      mirrorAdjustedInstalls: 20,
      diagnostics: { rawCoreDownloads: 35, estimatedAutomatedFloor: 15 },
      warning: 'estimate',
    },
    parseAnalyticsCounts({
      trials: 40,
      activatedDevelopers: 10,
      previousActivatedDevelopers: 8,
    }),
  )

  assert.deepEqual(report.metrics, {
    trials: 40,
    mirrorAdjustedInstalls: 20,
    activatedDevelopersThisWeek: 10,
    activationRatePercent: 50,
    activatedWeekOverWeekPercent: 25,
  })
})

test('does not invent analytics or divide by a zero baseline', () => {
  const downloads = {
    period: { start: '2026-08-03', end: '2026-08-09' },
    mirrorAdjustedInstalls: 0,
    diagnostics: { rawCoreDownloads: 5, estimatedAutomatedFloor: 5 },
    warning: 'estimate',
  }
  assert.deepEqual(buildWeeklyActivationReport(downloads).metrics, {
    trials: null,
    mirrorAdjustedInstalls: 0,
    activatedDevelopersThisWeek: null,
    activationRatePercent: null,
    activatedWeekOverWeekPercent: null,
  })
  const measured = buildWeeklyActivationReport(
    downloads,
    parseAnalyticsCounts({
      trials: 1,
      activatedDevelopers: 1,
      previousActivatedDevelopers: 0,
    }),
  )
  assert.equal(measured.metrics.activationRatePercent, null)
  assert.equal(measured.metrics.activatedWeekOverWeekPercent, null)
})

test('rejects raw or identifying analytics fields', () => {
  assert.throws(
    () =>
      parseAnalyticsCounts({
        trials: 1,
        activatedDevelopers: 1,
        previousActivatedDevelopers: 1,
        installationIds: ['do-not-ingest'],
      }),
    /unsupported field.*installationIds/,
  )
})

test('fails instead of substituting zero when npm omits a requested day', () => {
  assert.throws(
    () =>
      summarizeDownloadSeries(
        [
          {
            name: 'nominee',
            downloads: [{ day: '2026-08-03', downloads: 10 }],
          },
          {
            name: 'nominee-cli',
            downloads: [
              { day: '2026-08-03', downloads: 5 },
              { day: '2026-08-04', downloads: 7 },
            ],
          },
        ],
        '2026-08-03',
        '2026-08-04',
      ),
    /omitted 2026-08-04.*nominee/,
  )
})
