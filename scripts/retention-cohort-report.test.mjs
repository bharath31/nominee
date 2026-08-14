import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cohortWeek,
  formatRetentionReport,
  parseUsageJsonl,
  summarizeRetentionCohorts,
} from './retention-cohort-report.mjs'

const DAY = 864e5
const t0 = Date.parse('2026-01-05T12:00:00Z') // Monday

function event(overrides) {
  return {
    schemaVersion: 1,
    type: 'governed_action',
    principalId: 'p1',
    eventId: 'e1',
    status: 'succeeded',
    at: t0,
    ...overrides,
  }
}

test('cohorts by Monday-start UTC week', () => {
  assert.equal(cohortWeek(Date.parse('2026-01-05T00:00:00Z')), '2026-01-05')
  assert.equal(cohortWeek(Date.parse('2026-01-11T23:00:00Z')), '2026-01-05')
  assert.equal(cohortWeek(Date.parse('2026-01-12T00:00:00Z')), '2026-01-12')
})

test('dedupes eventId and skips non-usage lines', () => {
  const { events, skipped } = parseUsageJsonl(
    `${JSON.stringify(event())}\n${JSON.stringify(event())}\n{"type":"cli_proof_completed"}\n`,
  )
  assert.equal(events.length, 2)
  assert.equal(skipped.notGovernedAction, 1)
  const report = summarizeRetentionCohorts(events, { asOf: t0 + DAY })
  assert.equal(report.events, 1)
  assert.equal(report.duplicatesDropped, 1)
})

test('tracks 7/28/90 retention only after the observation window closes', () => {
  const events = [
    event({ principalId: 'kept', eventId: 'a0', at: t0 }),
    event({ principalId: 'kept', eventId: 'a7', at: t0 + 7 * DAY }),
    event({ principalId: 'kept', eventId: 'a28', at: t0 + 28 * DAY }),
    event({ principalId: 'kept', eventId: 'a90', at: t0 + 90 * DAY, action: 'refund.issue' }),
    event({ principalId: 'gone', eventId: 'b0', at: t0, status: 'denied' }),
  ]

  const early = summarizeRetentionCohorts(events, { asOf: t0 + 10 * DAY })
  const d7 = early.cohorts[0].retention['7']
  assert.equal(d7.retained, 0)
  assert.equal(d7.pending, 2)
  assert.equal(early.cohorts[0].retention['90'].pending, 2)
  assert.equal(early.decision.status, 'not_yet')

  const mature = summarizeRetentionCohorts(events, { asOf: t0 + 98 * DAY })
  assert.equal(mature.cohorts[0].retention['90'].retained, 1)
  assert.equal(mature.cohorts[0].retention['90'].eligible, 2)
  assert.equal(mature.cohorts[0].statusMix.denied, 1)
  assert.equal(mature.expansion.distinctActions, 1)
})

test('expansion is distinct named actions in the export, not per principal', () => {
  const withNames = [
    event({ eventId: '1', action: 'orders.read' }),
    event({ eventId: '2', at: t0 + DAY, action: 'refund.issue' }),
  ]
  const named = summarizeRetentionCohorts(withNames, { asOf: t0 + DAY })
  assert.equal(named.expansion.distinctActions, 2)

  const split = summarizeRetentionCohorts(
    [
      event({ principalId: 'a', eventId: 'a1', action: 'orders.read' }),
      event({ principalId: 'b', eventId: 'b1', action: 'refund.issue' }),
    ],
    { asOf: t0 + DAY },
  )
  assert.equal(split.expansion.distinctActions, 2)

  const unnamed = summarizeRetentionCohorts([event()], { asOf: t0 + DAY })
  assert.equal(unnamed.expansion.unknown, 1)
  assert.match(unnamed.gaps.join('\n'), /includeAction/)
})

test('exactly 60% day-90 retention is the ambiguous band', () => {
  const events = []
  for (let i = 0; i < 100; i++) {
    events.push(event({ principalId: `p${i}`, eventId: `first-${i}`, at: t0 }))
    if (i < 60) {
      events.push(
        event({
          principalId: `p${i}`,
          eventId: `later-${i}`,
          at: t0 + 90 * DAY,
        }),
      )
    }
  }
  const recorded = summarizeRetentionCohorts(events, { asOf: t0 + 98 * DAY })
  assert.equal(recorded.decision.status, 'recorded')
  assert.equal(recorded.decision.band, '30_to_60')
  assert.equal(recorded.decision.firstHundredRetainedDay90, 60)
})

test('asOf ignores later events and does not treat --json as a date in CLI usage', () => {
  const events = [
    event({ eventId: 'first', at: t0 }),
    event({ eventId: 'future', at: t0 + 12 * DAY }),
  ]
  const snapshot = summarizeRetentionCohorts(events, { asOf: t0 + 10 * DAY })
  assert.equal(snapshot.events, 1)
  assert.equal(snapshot.cohorts[0].retention['7'].pending, 1)
})

test('day-90 gate uses the first 100 principals and does not invent a rate', () => {
  const events = []
  for (let i = 0; i < 100; i++) {
    events.push(
      event({
        principalId: `p${i}`,
        eventId: `first-${i}`,
        at: t0 + i * 1000,
      }),
    )
    if (i < 70) {
      events.push(
        event({
          principalId: `p${i}`,
          eventId: `later-${i}`,
          at: t0 + 90 * DAY + i * 1000,
          status: 'succeeded',
        }),
      )
    }
  }

  const waiting = summarizeRetentionCohorts(events.slice(0, 50), { asOf: t0 + 200 * DAY })
  assert.equal(waiting.decision.status, 'not_yet')

  const immature = summarizeRetentionCohorts(events, { asOf: t0 + 30 * DAY })
  assert.equal(immature.decision.status, 'waiting_for_maturity')

  const recorded = summarizeRetentionCohorts(events, { asOf: t0 + 98 * DAY })
  assert.equal(recorded.decision.status, 'recorded')
  assert.equal(recorded.decision.band, 'above_60')
  assert.equal(recorded.decision.firstHundredRetainedDay90, 70)
  assert.match(formatRetentionReport(recorded), /70% retained/)
})

test('fails closed on malformed usage lines', () => {
  assert.throws(() => parseUsageJsonl('{'), /invalid JSON/)
  assert.throws(
    () => parseUsageJsonl(JSON.stringify({ ...event(), schemaVersion: 2 })),
    /schemaVersion/,
  )
})
