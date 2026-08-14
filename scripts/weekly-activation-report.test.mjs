import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeDownloadSeries } from './weekly-activation-report.mjs'

test('aligns package downloads by day rather than array position', () => {
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
    ],
    '2026-08-03',
    '2026-08-04',
  )

  assert.equal(report.rawDownloads, 42)
  assert.equal(report.estimatedAutomatedFloor, 24)
  assert.equal(report.estimatedHumanDownloads, 18)
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
