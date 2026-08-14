// Generate a conservative, editable starter policy from a bounded observe-mode report.
// The output deliberately describes evidence rather than claiming to recommend security limits.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ArgumentObservation, ObservationReportV2, ToolObservation } from 'nominee'

const MAX_REPORT_TOOLS = 400
const MAX_ARGUMENTS_PER_TOOL = 40
const MAX_LABEL_LENGTH = 256

type InputReport = Omit<ObservationReportV2, 'version' | 'availableTools'> & {
  version: 1 | 2
  /** Version 1 reports predate tool-inventory capture. */
  availableTools?: string[]
}

export interface GeneratePolicyCommandResult {
  code: number
  path?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function validLabel(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_LABEL_LENGTH
}

function parseArgument(value: unknown): ArgumentObservation {
  if (!isRecord(value) || !validLabel(value.name) || !Array.isArray(value.types)) {
    throw new Error('invalid argument observation')
  }
  if (!value.types.every((type) => typeof type === 'string' && type.length <= 32)) {
    throw new Error(`invalid types for argument ${value.name}`)
  }
  if (!Number.isInteger(value.present) || (value.present as number) < 0) {
    throw new Error(`invalid presence count for argument ${value.name}`)
  }
  if (typeof value.unbounded !== 'boolean') {
    throw new Error(`invalid bound classification for argument ${value.name}`)
  }

  let range: ArgumentObservation['range']
  if (value.range !== undefined) {
    if (
      !isRecord(value.range) ||
      !isFiniteNumber(value.range.min) ||
      !isFiniteNumber(value.range.max) ||
      !isFiniteNumber(value.range.median) ||
      value.range.min > value.range.max ||
      value.range.median < value.range.min ||
      value.range.median > value.range.max
    ) {
      throw new Error(`invalid numeric range for argument ${value.name}`)
    }
    range = {
      min: value.range.min,
      max: value.range.max,
      median: value.range.median,
    }
  }

  return {
    name: value.name,
    types: [...value.types] as string[],
    present: value.present as number,
    ...(typeof value.distinctValues === 'number' ? { distinctValues: value.distinctValues } : {}),
    ...(range ? { range } : {}),
    unbounded: value.unbounded,
    ...(typeof value.note === 'string' ? { note: value.note } : {}),
  }
}

function parseTool(value: unknown): ToolObservation {
  if (
    !isRecord(value) ||
    !validLabel(value.tool) ||
    !Number.isInteger(value.calls) ||
    (value.calls as number) < 1 ||
    !isFiniteNumber(value.firstSeenAt) ||
    !isFiniteNumber(value.lastSeenAt) ||
    !['read', 'mutate', 'unknown'].includes(String(value.kind)) ||
    !Array.isArray(value.arguments) ||
    value.arguments.length > MAX_ARGUMENTS_PER_TOOL
  ) {
    throw new Error('invalid tool observation')
  }
  const argumentsSeen = value.arguments.map(parseArgument)
  return {
    tool: value.tool,
    calls: value.calls as number,
    firstSeenAt: value.firstSeenAt,
    lastSeenAt: value.lastSeenAt,
    users: typeof value.users === 'number' ? value.users : 0,
    kind: value.kind as ToolObservation['kind'],
    verdicts: isRecord(value.verdicts)
      ? {
          allow: Number(value.verdicts.allow) || 0,
          ask: Number(value.verdicts.ask) || 0,
          deny: Number(value.verdicts.deny) || 0,
        }
      : { allow: 0, ask: 0, deny: 0 },
    baseline: value.kind === 'read' ? 'allow' : 'ask',
    arguments: argumentsSeen,
    unboundedArguments: argumentsSeen
      .filter((argument) => argument.unbounded)
      .map((argument) => argument.name),
  }
}

/** Parse the intentionally small, bounded subset a generator relies on. */
export function parseObservationReport(value: unknown): InputReport {
  if (
    !isRecord(value) ||
    value.mode !== 'observe' ||
    (value.version !== 1 && value.version !== 2) ||
    !isRecord(value.window) ||
    !isFiniteNumber(value.window.from) ||
    !isFiniteNumber(value.window.to) ||
    value.window.from > value.window.to ||
    !isRecord(value.totals) ||
    !Number.isInteger(value.totals.calls) ||
    (value.totals.calls as number) < 0 ||
    !Array.isArray(value.tools) ||
    value.tools.length > MAX_REPORT_TOOLS
  ) {
    throw new Error('expected a nominee observe report (schema version 1 or 2)')
  }
  const tools = value.tools.map(parseTool)
  const availableTools = value.availableTools
  if (
    availableTools !== undefined &&
    (!Array.isArray(availableTools) ||
      availableTools.length > MAX_REPORT_TOOLS ||
      !availableTools.every(validLabel))
  ) {
    throw new Error('invalid available-tool inventory')
  }
  if (
    (value.untrackedTools !== undefined &&
      (!Number.isInteger(value.untrackedTools) ||
        (value.untrackedTools as number) < 0 ||
        (value.untrackedTools as number) > MAX_REPORT_TOOLS)) ||
    (value.toolsTruncated !== undefined && value.toolsTruncated !== true) ||
    (value.availableToolsTruncated !== undefined && value.availableToolsTruncated !== true)
  ) {
    throw new Error('invalid observation truncation metadata')
  }

  return {
    mode: 'observe',
    version: value.version,
    generatedAt: isFiniteNumber(value.generatedAt) ? value.generatedAt : value.window.to,
    window: { from: value.window.from, to: value.window.to },
    totals: {
      calls: value.totals.calls as number,
      tools: Number(value.totals.tools) || tools.length,
      allow: Number(value.totals.allow) || 0,
      ask: Number(value.totals.ask) || 0,
      deny: Number(value.totals.deny) || 0,
    },
    policyConfigured: value.policyConfigured === true,
    availableTools: availableTools ? [...new Set(availableTools)] : undefined,
    tools,
    ...(typeof value.untrackedTools === 'number' ? { untrackedTools: value.untrackedTools } : {}),
    ...(value.toolsTruncated === true ? { toolsTruncated: true as const } : {}),
    ...(value.availableToolsTruncated === true ? { availableToolsTruncated: true as const } : {}),
  }
}

function iso(at: number): string {
  return new Date(at).toISOString().slice(0, 10)
}

function numberLiteral(value: number): string {
  if (Object.is(value, -0)) return '0'
  return String(value)
}

function numericArgument(tool: ToolObservation): ArgumentObservation | undefined {
  const ranged = tool.arguments.filter(
    (argument) => argument.range && argument.types.includes('number'),
  )
  const preferred = ['amount', 'total', 'value', 'price', 'quantity', 'limit']
  return (
    preferred.map((name) => ranged.find((argument) => argument.name === name)).find(Boolean) ??
    ranged[0]
  )
}

function evidence(tool: ToolObservation): string {
  return `${tool.calls} call${tool.calls === 1 ? '' : 's'}, ${iso(tool.firstSeenAt)} to ${iso(
    tool.lastSeenAt,
  )}`
}

function unboundedNote(tool: ToolObservation): string[] {
  if (tool.unboundedArguments.length === 0) return []
  const labels = tool.unboundedArguments.map((name) => JSON.stringify(name)).join(', ')
  return [
    `    // Exposure observed: ${labels} ${
      tool.unboundedArguments.length === 1 ? 'accepts' : 'accept'
    } values the observed traffic does not constrain.`,
  ]
}

function thresholdPredicate(argument: ArgumentObservation, tool: string): string[] {
  const minimum = numberLiteral(argument.range?.min ?? 0)
  const threshold = numberLiteral(argument.range?.median ?? 0)
  const exact = tool.includes('*') ? [`        tool === ${JSON.stringify(tool)} &&`] : []
  const parameters = tool.includes('*') ? '{ input, tool }' : '{ input }'
  if (argument.name === '$input') {
    return [
      `      when: (${parameters}) =>`,
      ...exact,
      "        typeof input === 'number' &&",
      '        Number.isFinite(input) &&',
      `        input >= ${minimum} &&`,
      `        input <= ${threshold},`,
    ]
  }
  const key = JSON.stringify(argument.name)
  return [
    `      when: (${parameters}) =>`,
    ...exact,
    "        typeof input === 'object' &&",
    '        input !== null &&',
    `        ${key} in input &&`,
    `        typeof input[${key}] === 'number' &&`,
    `        Number.isFinite(input[${key}]) &&`,
    `        input[${key}] >= ${minimum} &&`,
    `        input[${key}] <= ${threshold},`,
  ]
}

function exactRule(effect: 'allow' | 'ask' | 'deny', tool: string): string[] {
  const name = JSON.stringify(tool)
  if (!tool.includes('*')) return [`    ${effect}(${name}),`]
  return [`    ${effect}(${name}, {`, `      when: ({ tool }) => tool === ${name},`, '    }),']
}

/** Emit readable JavaScript-compatible TypeScript with evidence above every rule. */
export function generateStarterPolicy(input: InputReport): string {
  const called = new Set(input.tools.map((tool) => tool.tool))
  const inventory = [...new Set([...(input.availableTools ?? []), ...called])].sort()
  if (inventory.length === 0) {
    throw new Error('observe report contains no tool traffic or callable-tool inventory')
  }
  const inventoryComplete =
    input.availableTools !== undefined &&
    !input.availableToolsTruncated &&
    !input.toolsTruncated &&
    !input.untrackedTools
  const neverCalled = inventoryComplete ? inventory.filter((tool) => !called.has(tool)) : []
  const rules: string[] = []

  for (const tool of [...input.tools].sort((a, b) => a.tool.localeCompare(b.tool))) {
    const name = JSON.stringify(tool.tool)
    const seen = evidence(tool)
    if (tool.kind === 'read') {
      rules.push(`    // Evidence: ${seen}; name-derived classification: read.`)
      rules.push(...unboundedNote(tool))
      rules.push(...exactRule('allow', tool.tool))
      continue
    }

    const threshold = tool.kind === 'mutate' ? numericArgument(tool) : undefined
    if (threshold?.range) {
      rules.push(
        `    // Evidence: ${seen}; observed ${JSON.stringify(threshold.name)} range ${numberLiteral(
          threshold.range.min,
        )}–${numberLiteral(threshold.range.max)} (median ${numberLiteral(
          threshold.range.median,
        )}).`,
      )
      rules.push(...unboundedNote(tool))
      rules.push(`    allow(${name}, {`)
      rules.push(...thresholdPredicate(threshold, tool.tool))
      rules.push('    }),')
      rules.push(
        `    // Evidence: ${seen}; values outside the observed minimum-to-median range reach a human.`,
      )
      rules.push(...exactRule('ask', tool.tool))
      continue
    }

    rules.push(
      `    // Evidence: ${seen}; ${
        tool.kind === 'unknown'
          ? 'the tool name does not establish that this is read-only'
          : 'mutation observed without a usable numeric threshold'
      }.`,
    )
    rules.push(...unboundedNote(tool))
    rules.push(...exactRule('ask', tool.tool))
  }

  for (const tool of neverCalled) {
    rules.push(
      `    // Evidence: 0 calls from ${iso(input.window.from)} to ${iso(
        input.window.to,
      )}; denying this currently-unused tool costs no observed workflow.`,
    )
    rules.push(...exactRule('deny', tool))
  }

  const inventoryWarning =
    input.availableTools === undefined
      ? '// This legacy report did not include a tool inventory, so tools that never ran cannot be listed here.\n'
      : inventoryComplete
        ? ''
        : '// This report truncated tool details or inventory, so no tool is labelled never-called or denied on that basis.\n'
  return `// Generated by nominee from observed traffic (${iso(input.window.from)} to ${iso(
    input.window.to,
  )}).
//
// IMPORTANT: this reflects what the agent did during that window, not what it should be
// allowed to do. Thresholds below are observations, not security recommendations. Review
// every rule, test failure paths, and keep the default deny while widening intentionally.
${inventoryWarning}import { allow, ask, deny } from 'nominee'

// nominee check reads this inventory so it validates the real tool names instead of examples.
export const nomineeObservedTools = ${JSON.stringify(inventory, null, 2)}

export default {
  rules: [
${rules.join('\n')}
  ],

  // Calls not matched above will now break closed. Add a narrow rule when that is intentional.
  fallback: 'deny',
}
`
}

/** Read an observe report and write a policy without overwriting by default. */
export function runGeneratePolicy(
  reportFile: string,
  outFile = 'nominee.policy.ts',
  force = false,
): GeneratePolicyCommandResult {
  let report: InputReport
  try {
    report = parseObservationReport(JSON.parse(readFileSync(reportFile, 'utf8')))
  } catch (error) {
    console.log(`✗ could not read observe report ${reportFile}: ${(error as Error).message}`)
    return { code: 1 }
  }

  const path = resolve(process.cwd(), outFile)
  if (!force && existsSync(path)) {
    console.log(
      `✗ refusing to overwrite ${outFile}; pass --force after reviewing the existing file`,
    )
    return { code: 1 }
  }

  try {
    writeFileSync(path, generateStarterPolicy(report), {
      encoding: 'utf8',
      flag: force ? 'w' : 'wx',
    })
  } catch (error) {
    console.log(`✗ could not write ${outFile}: ${(error as Error).message}`)
    return { code: 1 }
  }

  console.log(`✓ starter policy written to ${outFile}`)
  console.log('  Thresholds came from observed traffic; review them before enforcing.')
  return { code: 0, path }
}
