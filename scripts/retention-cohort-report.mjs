#!/usr/bin/env node
// Offline day-90 retention gate. Reads opt-in usageReporter JSONL from a
// partner or consenting user's own sink. Nominee does not collect this data.
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const DAY = 864e5
const WINDOW = 7 * DAY
const HORIZONS = [7, 28, 90]
const FIRST_HUNDRED = 100

const STATUS_KEYS = ['succeeded', 'failed', 'denied', 'expired']

export const GATE = {
  above: {
    min: 0.6,
    reading: 'Fit is real',
    action: 'Turn the W3/W4 crank hard; 500 becomes a matter of execution',
  },
  ambiguous: {
    min: 0.3,
    reading: 'Ambiguous',
    action: 'Find out where the other half went before spending more on acquisition',
  },
  below: {
    min: 0,
    reading: '500 is a vanity target',
    action: 'Stop the distribution spend; the effort belongs back in the product',
  },
}

function utcDay(at) {
  return new Date(at).toISOString().slice(0, 10)
}

/** Monday-start UTC week containing `at`, as YYYY-MM-DD of that Monday. */
export function cohortWeek(at) {
  const date = new Date(at)
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const weekday = (day.getUTCDay() + 6) % 7
  day.setUTCDate(day.getUTCDate() - weekday)
  return day.toISOString().slice(0, 10)
}

function emptyStatusMix() {
  return { succeeded: 0, failed: 0, denied: 0, expired: 0 }
}

function addStatus(mix, status) {
  if (STATUS_KEYS.includes(status)) mix[status] += 1
}

function parseLine(line, index) {
  let event
  try {
    event = JSON.parse(line)
  } catch {
    throw new Error(`invalid JSON on line ${index + 1}`)
  }
  if (!event || event.type !== 'governed_action') {
    return { skip: true, reason: 'not a governed_action event' }
  }
  if (event.schemaVersion !== 1) {
    throw new Error(`unsupported schemaVersion on line ${index + 1}`)
  }
  if (typeof event.principalId !== 'string' || !event.principalId) {
    throw new Error(`missing principalId on line ${index + 1}`)
  }
  if (typeof event.eventId !== 'string' || !event.eventId) {
    throw new Error(`missing eventId on line ${index + 1}`)
  }
  if (typeof event.at !== 'number' || !Number.isFinite(event.at)) {
    throw new Error(`invalid at on line ${index + 1}`)
  }
  if (!STATUS_KEYS.includes(event.status)) {
    throw new Error(`invalid status on line ${index + 1}`)
  }
  return { event }
}

export function parseUsageJsonl(text) {
  const events = []
  const skipped = { notGovernedAction: 0 }
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const parsed = parseLine(line, i)
    if (parsed.skip) {
      skipped.notGovernedAction += 1
      continue
    }
    events.push(parsed.event)
  }
  return { events, skipped }
}

function dedupe(events) {
  const seen = new Set()
  const unique = []
  for (const event of events) {
    if (seen.has(event.eventId)) continue
    seen.add(event.eventId)
    unique.push(event)
  }
  return unique
}

function inWindow(at, start, end) {
  return at >= start && at < end
}

function retentionFor(firstAt, events, horizonDays, asOf) {
  const start = firstAt + horizonDays * DAY
  const end = start + WINDOW
  const retained = events.some((event) => inWindow(event.at, start, end))
  if (asOf < start) return { eligible: false, retained: false, pending: true }
  if (retained) return { eligible: true, retained: true, pending: false }
  if (asOf < end) return { eligible: false, retained: false, pending: true }
  return { eligible: true, retained: false, pending: false }
}

function readGate(rate) {
  if (rate >= GATE.above.min) return { band: 'above_60', ...GATE.above }
  if (rate >= GATE.ambiguous.min) return { band: '30_to_60', ...GATE.ambiguous }
  return { band: 'below_30', ...GATE.below }
}

/**
 * Cohort usageReporter events by week of first governed action.
 *
 * Retention at N days means at least one later event in the 7-day window
 * starting at firstAt + N days. Incomplete windows are pending, not zero.
 */
export function summarizeRetentionCohorts(events, options = {}) {
  const asOf = options.asOf ?? Date.now()
  const unique = dedupe(events).sort((a, b) => a.at - b.at)

  const byPrincipal = new Map()
  const statusMixAll = emptyStatusMix()
  let eventsWithAction = 0

  for (const event of unique) {
    addStatus(statusMixAll, event.status)
    if (typeof event.action === 'string' && event.action) eventsWithAction += 1
    let principal = byPrincipal.get(event.principalId)
    if (!principal) {
      principal = { principalId: event.principalId, events: [], actions: new Set() }
      byPrincipal.set(event.principalId, principal)
    }
    principal.events.push(event)
    if (typeof event.action === 'string' && event.action) principal.actions.add(event.action)
  }

  const principals = [...byPrincipal.values()]
    .map((principal) => {
      const firstAt = principal.events[0].at
      const lastAt = principal.events[principal.events.length - 1].at
      const statusMix = emptyStatusMix()
      for (const event of principal.events) addStatus(statusMix, event.status)
      return {
        principalId: principal.principalId,
        firstAt,
        lastAt,
        eventCount: principal.events.length,
        distinctActions: principal.actions.size,
        expanded: principal.actions.size >= 2,
        statusMix,
        events: principal.events,
      }
    })
    .sort((a, b) => a.firstAt - b.firstAt || a.principalId.localeCompare(b.principalId))

  const cohorts = new Map()
  for (const principal of principals) {
    const week = cohortWeek(principal.firstAt)
    if (!cohorts.has(week)) {
      cohorts.set(week, {
        week,
        principals: 0,
        events: 0,
        statusMix: emptyStatusMix(),
        expanded: 0,
        expansionUnknown: 0,
        retention: Object.fromEntries(
          HORIZONS.map((days) => [String(days), { eligible: 0, retained: 0, pending: 0 }]),
        ),
      })
    }
    const cohort = cohorts.get(week)
    cohort.principals += 1
    cohort.events += principal.eventCount
    for (const key of STATUS_KEYS) cohort.statusMix[key] += principal.statusMix[key]
    if (principal.distinctActions === 0) cohort.expansionUnknown += 1
    else if (principal.expanded) cohort.expanded += 1
    for (const days of HORIZONS) {
      const result = retentionFor(principal.firstAt, principal.events, days, asOf)
      const bucket = cohort.retention[String(days)]
      if (result.pending) bucket.pending += 1
      else {
        bucket.eligible += 1
        if (result.retained) bucket.retained += 1
      }
    }
  }

  const cohortList = [...cohorts.values()].sort((a, b) => a.week.localeCompare(b.week))
  for (const cohort of cohortList) {
    for (const days of HORIZONS) {
      const bucket = cohort.retention[String(days)]
      bucket.rate = bucket.eligible === 0 ? null : bucket.retained / bucket.eligible
    }
  }

  const firstHundred = principals.slice(0, FIRST_HUNDRED)
  const day90 = firstHundred.map((principal) =>
    retentionFor(principal.firstAt, principal.events, 90, asOf),
  )
  const eligible90 = day90.filter((row) => row.eligible)
  const retained90 = eligible90.filter((row) => row.retained)
  const pending90 = day90.filter((row) => row.pending)

  const gaps = []
  if (unique.length === 0) {
    gaps.push('No governed_action events in the export. Retention is unknown, not zero.')
  }
  if (eventsWithAction === 0 && unique.length > 0) {
    gaps.push(
      'Action names were omitted. Expansion (one protected action → two) cannot be measured unless partners enable usageReporter({ includeAction: true }).',
    )
  }
  gaps.push(
    'Whether a previously broad credential now sits behind the boundary is not in the usageReporter event shape. Record that from partner interviews, not this export.',
  )

  let decision
  if (principals.length < FIRST_HUNDRED) {
    decision = {
      status: 'not_yet',
      activatedPrincipals: principals.length,
      firstHundred: FIRST_HUNDRED,
      note: `Decision waits for ~${FIRST_HUNDRED} activated developers with a real governed action. ${principals.length} in this export.`,
    }
  } else if (pending90.length > 0) {
    decision = {
      status: 'waiting_for_maturity',
      activatedPrincipals: principals.length,
      firstHundredEligibleForDay90: eligible90.length,
      firstHundredPendingDay90: pending90.length,
      note: 'The first 100 activated developers have not all completed the day-90 observation window. Do not invent a rate.',
    }
  } else {
    const rate = retained90.length / eligible90.length
    const gate = readGate(rate)
    decision = {
      status: 'recorded',
      activatedPrincipals: principals.length,
      firstHundredEligibleForDay90: eligible90.length,
      firstHundredRetainedDay90: retained90.length,
      firstHundredPendingDay90: pending90.length,
      day90Retention: rate,
      ...gate,
    }
  }

  return {
    asOf: utcDay(asOf),
    warning:
      'This report only measures principals present in the supplied export. Nominee has no telemetry of its own. Missing data is a gap, not a zero.',
    events: unique.length,
    duplicatesDropped: events.length - unique.length,
    activatedPrincipals: principals.length,
    statusMix: statusMixAll,
    expansion: {
      principalsWithActionNames: principals.filter((p) => p.distinctActions > 0).length,
      expandedToTwoOrMoreActions: principals.filter((p) => p.expanded).length,
      unknown: principals.filter((p) => p.distinctActions === 0).length,
    },
    cohorts: cohortList,
    decision,
    gaps,
  }
}

export function formatRetentionReport(report) {
  const lines = [
    `nominee retention — as of ${report.asOf} UTC`,
    report.warning,
    '',
    `activated principals (first governed action): ${report.activatedPrincipals}`,
    `events (deduped): ${report.events}`,
    `status mix: allow/succeeded ${report.statusMix.succeeded} · fail ${report.statusMix.failed} · deny ${report.statusMix.denied} · expired ${report.statusMix.expired}`,
    `expansion 1→2 actions: ${report.expansion.expandedToTwoOrMoreActions} of ${report.expansion.principalsWithActionNames} with action names (${report.expansion.unknown} unknown)`,
    '',
    'weekly cohorts (week starts Monday UTC)',
  ]

  for (const cohort of report.cohorts) {
    const r = (days) => {
      const bucket = cohort.retention[String(days)]
      if (bucket.eligible === 0) return `d${days} pending ${bucket.pending}`
      const pct = `${Math.round(bucket.rate * 100)}%`
      return `d${days} ${bucket.retained}/${bucket.eligible} (${pct})${bucket.pending ? ` · ${bucket.pending} pending` : ''}`
    }
    lines.push(
      `  ${cohort.week}  n=${cohort.principals}  ${r(7)}  ${r(28)}  ${r(90)}  mix s/f/d/e ${cohort.statusMix.succeeded}/${cohort.statusMix.failed}/${cohort.statusMix.denied}/${cohort.statusMix.expired}  expanded ${cohort.expanded}${cohort.expansionUnknown ? ` · ${cohort.expansionUnknown} unknown` : ''}`,
    )
  }

  lines.push('', 'day-90 gate (first 100 activated developers)')
  const { decision } = report
  if (decision.status === 'recorded') {
    lines.push(
      `  ${Math.round(decision.day90Retention * 100)}% retained (${decision.firstHundredRetainedDay90}/${decision.firstHundredEligibleForDay90}) · ${decision.reading}`,
      `  ${decision.action}`,
    )
  } else {
    lines.push(`  ${decision.status}: ${decision.note}`)
  }

  if (report.gaps.length) {
    lines.push('', 'gaps')
    for (const gap of report.gaps) lines.push(`  · ${gap}`)
  }
  return `${lines.join('\n')}\n`
}

async function main() {
  const path = process.argv[2]
  if (!path) {
    throw new Error(
      'usage: node scripts/retention-cohort-report.mjs <events.jsonl> [asOf=YYYY-MM-DD]',
    )
  }
  const asOfArg = process.argv[3]
  const asOf = asOfArg ? Date.parse(`${asOfArg}T23:59:59.999Z`) : Date.now()
  if (asOfArg && !Number.isFinite(asOf)) throw new Error(`invalid asOf date: ${asOfArg}`)

  const text = await readFile(path, 'utf8')
  const { events } = parseUsageJsonl(text)
  const report = summarizeRetentionCohorts(events, { asOf })
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2))
    return
  }
  console.log(formatRetentionReport(report))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
