/**
 * Observe mode's bookkeeping: what the agent actually called, how often, with
 * what shape of arguments, and what the configured policy *would* have said.
 *
 * This file records observations. It does not make security judgements and it
 * cannot: every classification here is derived from tool names and from the
 * arguments a particular week of traffic happened to contain. `kind` and
 * `baseline` are starting points for a human to edit, never recommendations —
 * a tool named `orders.read` can still be the most dangerous call in a system.
 *
 * Everything is bounded: tools, arguments per tool, distinct values per
 * argument, and numeric samples all have caps, so a long-running observe
 * session cannot grow without limit.
 */
import { sha256 } from './hash.js'
import type { Effect } from './policy.js'

/** How many tools are tracked before new ones are counted but not detailed. */
const MAX_TOOLS = 200
/** How many additional distinct tool names are counted without details. */
const MAX_UNTRACKED_TOOLS = 200
/** How many distinct argument names are tracked per tool. */
const MAX_ARGUMENTS = 40
/** Distinct scalar fingerprints kept before an argument is treated as free-form. */
const MAX_DISTINCT_VALUES = 8
/** Numeric samples kept per argument for the median; extrema include every finite value. */
const MAX_SAMPLES = 1000
/** Distinct users counted per tool. */
const MAX_USERS = 1000
/** Longest string still eligible to be part of a small enumerable set. */
const MAX_ENUM_STRING_LENGTH = 64
/** Longest tool or argument label retained in a long-running report. */
const MAX_LABEL_LENGTH = 256

/**
 * Name-derived guess at what a tool does. `'unknown'` is the honest answer
 * whenever the name carries no verb we recognise.
 */
export type ToolKind = 'read' | 'mutate' | 'unknown'

const READ_VERBS = [
  'read',
  'get',
  'list',
  'search',
  'find',
  'fetch',
  'query',
  'view',
  'show',
  'describe',
  'lookup',
  'count',
  'check',
  'status',
]

const MUTATE_VERBS = [
  'create',
  'update',
  'delete',
  'remove',
  'write',
  'send',
  'post',
  'issue',
  'refund',
  'charge',
  'pay',
  'transfer',
  'merge',
  'close',
  'open',
  'set',
  'patch',
  'put',
  'insert',
  'upsert',
  'drop',
  'cancel',
  'approve',
  'revoke',
  'grant',
  'deploy',
  'publish',
  'run',
  'execute',
  'invite',
  'add',
]

/** Split a tool name into its lowercase word parts (`refund.issue` → refund, issue). */
function words(tool: string): string[] {
  return tool
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.toLowerCase())
}

/** Retain useful labels without letting attacker-controlled names pin unbounded memory. */
function boundedLabel(label: string): string {
  if (label.length <= MAX_LABEL_LENGTH) return label
  const suffix = `…#${sha256(label).slice(0, 16)}`
  return `${label.slice(0, MAX_LABEL_LENGTH - suffix.length)}${suffix}`
}

/**
 * Classify a tool by name alone. Deliberately conservative: anything we don't
 * recognise is `'unknown'`, which downstream is treated like a mutation
 * (proposing `ask`) rather than like a read.
 */
export function classifyTool(tool: string): ToolKind {
  const parts = words(tool)
  if (parts.some((part) => MUTATE_VERBS.includes(part))) return 'mutate'
  if (parts.some((part) => READ_VERBS.includes(part))) return 'read'
  return 'unknown'
}

/** What one argument of one tool looked like across the observed window. */
export interface ArgumentObservation {
  /** Top-level key of the tool's input object, or `$input` for a root scalar/array. */
  name: string
  /** JSON types seen, e.g. `['number']` or `['string', 'null']`. */
  types: string[]
  /** How many observed calls carried this argument. */
  present: number
  /** Number of distinct scalar fingerprints seen, when the bounded count is known. */
  distinctValues?: number
  /** Observed numeric range. Median is sampled; min/max include every finite number. */
  range?: { min: number; max: number; median: number }
  /**
   * `true` when nothing in the observed traffic bounds this argument: any
   * number, free-form text, or a nested structure. An unbounded argument is
   * where an agent's authority is widest — a refund amount with no ceiling
   * accepts $5 and $5,000,000 alike.
   */
  unbounded: boolean
  /** Why the argument was classified the way it was. */
  note?: string
}

/** Everything observed about one tool. */
export interface ToolObservation {
  tool: string
  calls: number
  firstSeenAt: number
  lastSeenAt: number
  /** Distinct users the tool was called for (capped at 1,000). */
  users: number
  /** Set when more distinct users were seen than observe mode tracks. */
  usersTruncated?: true
  /** Name-derived classification. A heuristic, not a security judgement. */
  kind: ToolKind
  /** What the configured policy said, by effect. All zero when no policy was configured. */
  verdicts: { allow: number; ask: number; deny: number }
  /**
   * Starting point derived from {@link kind}: `'allow'` for calls that only
   * read, `'ask'` for everything else. It reflects the tool's *name*, not its
   * risk.
   */
  baseline: 'allow' | 'ask'
  arguments: ArgumentObservation[]
  /** Names of the arguments nothing observed bounds. */
  unboundedArguments: string[]
  /** Set when the tool had more argument names than observe mode tracks. */
  argumentsTruncated?: true
}

/** A serializable summary of one observe session. */
export interface ObservationReport {
  mode: 'observe'
  /** Schema version, so a generator can refuse a report it doesn't understand. */
  version: 1
  generatedAt: number
  /** First and last observed call. Both `generatedAt` when nothing was seen. */
  window: { from: number; to: number }
  totals: {
    calls: number
    /** Distinct tool count, or a lower bound when {@link toolsTruncated} is set. */
    tools: number
    /** Policy verdicts across every observed call — recorded, never enforced. */
    allow: number
    ask: number
    deny: number
  }
  /** Whether a policy was configured while observing. */
  policyConfigured: boolean
  /** Tools, busiest first. */
  tools: ToolObservation[]
  /** Number of distinct tools beyond {@link MAX_TOOLS} that were not detailed. */
  untrackedTools?: number
  /** Set when even the bounded count of untracked tool names was exhausted. */
  toolsTruncated?: true
}

interface ArgumentState {
  name: string
  types: Set<string>
  present: number
  /** SHA-256 fingerprints used only to count bounded cardinality; never exposed. */
  distinctHashes: Set<string>
  distinctOverflowed: boolean
  samples: number[]
  numeric: number
  numericMin?: number
  numericMax?: number
  nested: number
  longString: boolean
}

interface ToolState {
  tool: string
  calls: number
  firstSeenAt: number
  lastSeenAt: number
  /** Hashed identities only; raw user identifiers are never retained. */
  users: Set<string>
  usersOverflowed: boolean
  verdicts: { allow: number; ask: number; deny: number }
  args: Map<string, ArgumentState>
  argsOverflowed: boolean
}

/** One observed call, as the collector sees it. */
export interface ObservedCall {
  tool: string
  input?: unknown
  user: string
  /** What the policy decided — recorded, not enforced. */
  effect: Effect
  at?: number
}

/**
 * Accumulates {@link ObservedCall}s into an {@link ObservationReport}.
 * Delegated sub-agents share their parent's collector, so one report covers
 * the whole delegation chain.
 */
export class ObservationCollector {
  private readonly tools = new Map<string, ToolState>()
  private readonly untracked = new Set<string>()
  private untrackedOverflowed = false
  private calls = 0
  /** Verdict totals across every call, including tools past the tracking cap. */
  private readonly verdicts = { allow: 0, ask: 0, deny: 0 }
  private from?: number
  private to?: number
  private sawPolicy = false

  /** Record one observed call. Never throws — observation must not break a run. */
  record(call: ObservedCall): void {
    try {
      this.recordUnsafe(call)
    } catch {
      // Inputs are application-controlled and can include hostile getters or
      // proxies. Observation is best-effort and must never break execution.
    }
  }

  private recordUnsafe(call: ObservedCall): void {
    const at = typeof call.at === 'number' && Number.isFinite(call.at) ? call.at : Date.now()
    const tool = boundedLabel(call.tool)
    this.calls++
    this.verdicts[call.effect]++
    this.from = this.from === undefined ? at : Math.min(this.from, at)
    this.to = this.to === undefined ? at : Math.max(this.to, at)

    let state = this.tools.get(tool)
    if (!state) {
      if (this.tools.size >= MAX_TOOLS) {
        if (this.untracked.has(tool)) return
        if (this.untracked.size < MAX_UNTRACKED_TOOLS) this.untracked.add(tool)
        else this.untrackedOverflowed = true
        return
      }
      state = {
        tool,
        calls: 0,
        firstSeenAt: at,
        lastSeenAt: at,
        users: new Set(),
        usersOverflowed: false,
        verdicts: { allow: 0, ask: 0, deny: 0 },
        args: new Map(),
        argsOverflowed: false,
      }
      this.tools.set(tool, state)
    }

    state.calls++
    state.lastSeenAt = Math.max(state.lastSeenAt, at)
    state.firstSeenAt = Math.min(state.firstSeenAt, at)
    const userHash = sha256(call.user)
    if (state.users.has(userHash)) {
      // Already counted.
    } else if (state.users.size < MAX_USERS) {
      state.users.add(userHash)
    } else {
      state.usersOverflowed = true
    }
    state.verdicts[call.effect]++
    this.recordArguments(state, call.input)
  }

  /** Note that a policy was configured while observing. */
  markPolicyConfigured(): void {
    this.sawPolicy = true
  }

  get size(): number {
    return this.calls
  }

  /** Build the report. Pure — the collector keeps accumulating afterwards. */
  report(now = Date.now()): ObservationReport {
    const tools = [...this.tools.values()]
      .map((state) => summarizeTool(state))
      .sort((a, b) => b.calls - a.calls || a.tool.localeCompare(b.tool))

    const totals = {
      calls: this.calls,
      tools: this.tools.size + this.untracked.size,
      ...this.verdicts,
    }

    return {
      mode: 'observe',
      version: 1,
      generatedAt: now,
      window: { from: this.from ?? now, to: this.to ?? now },
      totals,
      policyConfigured: this.sawPolicy,
      tools,
      ...(this.untracked.size ? { untrackedTools: this.untracked.size } : {}),
      ...(this.untrackedOverflowed ? { toolsTruncated: true as const } : {}),
    }
  }

  private recordArguments(state: ToolState, input: unknown): void {
    if (input === undefined) return
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      this.recordArgument(state, '$input', input)
      return
    }
    for (const [name, value] of Object.entries(input as Record<string, unknown>)) {
      if (value === undefined) continue
      this.recordArgument(state, name, value)
    }
  }

  private recordArgument(state: ToolState, name: string, value: unknown): void {
    const label = boundedLabel(name)
    let arg = state.args.get(label)
    if (!arg) {
      if (state.args.size >= MAX_ARGUMENTS) {
        state.argsOverflowed = true
        return
      }
      arg = {
        name: label,
        types: new Set(),
        present: 0,
        distinctHashes: new Set(),
        distinctOverflowed: false,
        samples: [],
        numeric: 0,
        nested: 0,
        longString: false,
      }
      state.args.set(label, arg)
    }
    arg.present++
    arg.types.add(typeOf(value))

    if (typeof value === 'number') {
      arg.numeric++
      if (Number.isFinite(value)) {
        arg.numericMin = arg.numericMin === undefined ? value : Math.min(arg.numericMin, value)
        arg.numericMax = arg.numericMax === undefined ? value : Math.max(arg.numericMax, value)
        if (arg.samples.length < MAX_SAMPLES) arg.samples.push(value)
      }
    }
    if (value !== null && typeof value === 'object') {
      arg.nested++
      return
    }
    if (typeof value === 'string' && value.length > MAX_ENUM_STRING_LENGTH) {
      // Long strings are likely free-form or secret-bearing. Do not retain even a fingerprint.
      arg.longString = true
      return
    }
    if (!arg.distinctOverflowed) {
      arg.distinctHashes.add(sha256(`${typeOf(value)}:${String(value)}`))
      if (arg.distinctHashes.size > MAX_DISTINCT_VALUES) {
        arg.distinctOverflowed = true
        arg.distinctHashes.clear()
      }
    }
  }
}

function typeOf(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function summarizeTool(state: ToolState): ToolObservation {
  const kind = classifyTool(state.tool)
  const args = [...state.args.values()]
    .map((arg) => summarizeArgument(arg))
    .sort((a, b) => b.present - a.present || a.name.localeCompare(b.name))

  return {
    tool: state.tool,
    calls: state.calls,
    firstSeenAt: state.firstSeenAt,
    lastSeenAt: state.lastSeenAt,
    users: state.users.size,
    ...(state.usersOverflowed ? { usersTruncated: true as const } : {}),
    kind,
    verdicts: { ...state.verdicts },
    baseline: kind === 'read' ? 'allow' : 'ask',
    arguments: args,
    unboundedArguments: args.filter((arg) => arg.unbounded).map((arg) => arg.name),
    ...(state.argsOverflowed ? { argumentsTruncated: true as const } : {}),
  }
}

function summarizeArgument(arg: ArgumentState): ArgumentObservation {
  const types = [...arg.types].sort()
  const range =
    arg.samples.length && arg.numericMin !== undefined && arg.numericMax !== undefined
      ? numericRange(arg.samples, arg.numericMin, arg.numericMax)
      : undefined
  const enumerable = !arg.distinctOverflowed && !arg.longString && arg.nested === 0
  const hasNumeric = arg.numeric > 0

  let unbounded: boolean
  let note: string | undefined
  if (arg.nested > 0) {
    unbounded = true
    note = 'nested structure — the shape of this argument is not constrained'
  } else if (hasNumeric) {
    unbounded = true
    note = 'numeric — nothing observed puts a ceiling on this value'
  } else if (!enumerable) {
    unbounded = true
    note = 'free-form text — too many distinct values to enumerate'
  } else {
    unbounded = false
    note = 'a small set of scalar fingerprints was observed'
  }

  return {
    name: arg.name,
    types,
    present: arg.present,
    ...(enumerable && arg.distinctHashes.size ? { distinctValues: arg.distinctHashes.size } : {}),
    ...(range ? { range } : {}),
    unbounded,
    ...(note ? { note } : {}),
  }
}

function numericRange(
  samples: number[],
  min: number,
  max: number,
): { min: number; max: number; median: number } {
  const sorted = [...samples].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 === 0
      ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
      : (sorted[middle] ?? 0)
  return { min, max, median }
}

/**
 * Render an {@link ObservationReport} as a terminal report. The first line
 * says enforcement was off, because that is the single most important fact
 * about every number below it.
 */
export function formatObservations(report: ObservationReport): string {
  const lines: string[] = []
  const window =
    report.totals.calls === 0
      ? 'no calls observed'
      : `${isoDate(report.window.from)} → ${isoDate(report.window.to)}`

  const toolCount = report.toolsTruncated
    ? `at least ${report.totals.tools}`
    : String(report.totals.tools)
  lines.push(
    `nominee observe — ${report.totals.calls} call(s) across ${toolCount} tool(s), ${window}`,
  )
  lines.push('ENFORCEMENT WAS OFF: every observed call reached its tool callback.')
  lines.push('')

  if (report.tools.length === 0) {
    lines.push('  No tool calls were observed.')
    return lines.join('\n')
  }

  const nameWidth = Math.max(4, ...report.tools.map((tool) => tool.tool.length))
  lines.push(`  ${'tool'.padEnd(nameWidth)}  calls  kind`)
  for (const tool of report.tools) {
    lines.push(`  ${tool.tool.padEnd(nameWidth)}  ${String(tool.calls).padStart(5)}  ${tool.kind}`)
    for (const arg of tool.arguments) {
      const detail = arg.range
        ? `${arg.types.join('|')}, observed ${arg.range.min}–${arg.range.max} (median ${arg.range.median})`
        : arg.distinctValues !== undefined
          ? `${arg.types.join('|')}, ${arg.distinctValues} distinct value(s) observed`
          : arg.types.join('|')
      lines.push(
        `  ${' '.repeat(nameWidth)}    ↳ ${arg.name}: ${detail}${arg.unbounded ? '  [unbounded]' : ''}`,
      )
    }
    if (tool.verdicts.deny || tool.verdicts.ask) {
      lines.push(
        `  ${' '.repeat(nameWidth)}    policy would have: ${tool.verdicts.deny} denied, ${tool.verdicts.ask} asked (not enforced)`,
      )
    }
  }

  lines.push('')
  lines.push(
    report.policyConfigured
      ? `  Policy verdicts recorded: ${report.totals.allow} allow, ${report.totals.ask} ask, ${report.totals.deny} deny — none enforced.`
      : '  No policy was configured, so every call was recorded as allowed.',
  )
  lines.push('  These are observations of what your agent did, not a judgement about what it')
  lines.push('  should be allowed to do.')
  if (report.untrackedTools) {
    lines.push(`  ${report.untrackedTools} further tool(s) were seen but not detailed.`)
  }
  if (report.toolsTruncated) {
    lines.push('  Additional distinct tool names were omitted after the counting cap.')
  }
  return lines.join('\n')
}

function isoDate(at: number): string {
  return new Date(at).toISOString().slice(0, 10)
}
