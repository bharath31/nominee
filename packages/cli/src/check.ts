// `nominee check <policy-file>` — dynamically import a user's policy module
// and report which rules are reachable against a built-in set of sample tool
// calls, the same way packages/core/src/nominee.ts warns in dev mode about
// rules that never match any guarded tool (see `warnNeverMatchingRules`).
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { type Policy, type Rule, matchTool } from 'nominee'

export interface CheckCommandResult {
  code: number
}

/**
 * Built-in sample calls standing in for a real agent's traffic. Only the
 * tool name is used for matching (the same static reachability check the
 * core dev-mode warnings perform) — rule `when` predicates are not executed,
 * since we don't know what shape of `input` a user's rules expect.
 */
const SAMPLE_TOOLS: readonly string[] = [
  'email.read',
  'email.forward',
  'email.delete',
  'github.get_pr',
  'github.merge_pr',
  'file.read',
  'file.write',
  'payment.charge',
  'slack.post_message',
  'calendar.create_event',
]

function normalizePolicy(input: unknown): Policy | undefined {
  if (Array.isArray(input)) return { rules: input as Rule[] }
  if (input && typeof input === 'object' && Array.isArray((input as { rules?: unknown }).rules)) {
    return input as Policy
  }
  return undefined
}

/** Levenshtein edit distance, for "did you mean" suggestions. */
function levenshtein(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = i - 1
    previous[0] = i
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j] ?? 0
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      previous[j] = Math.min((previous[j - 1] ?? 0) + 1, above + 1, diagonal + cost)
      diagonal = above
    }
  }
  return previous[b.length] ?? a.length
}

function nearestSampleTool(pattern: string): string | undefined {
  const literal = pattern.replace(/\*/g, '')
  let best: { tool: string; distance: number } | undefined
  for (const tool of SAMPLE_TOOLS) {
    const distance = levenshtein(literal, tool)
    if (!best || distance < best.distance) best = { tool, distance }
  }
  if (!best) return undefined
  const threshold = Math.max(2, Math.ceil(Math.max(literal.length, best.tool.length) / 2))
  return best.distance <= threshold ? best.tool : undefined
}

/**
 * Load a policy file and report which rules matched at least one sample
 * call and which never matched. The default export must be either a
 * `Rule[]` array (as returned by `allow`/`deny`/`ask`) or a `Policy` object
 * (`{ rules, fallback }`) — the same two shapes `NomineeOptions.policy`
 * already accepts.
 */
export async function runCheck(policyFile: string): Promise<CheckCommandResult> {
  const path = resolve(process.cwd(), policyFile)
  if (!existsSync(path)) {
    console.log(`✗ policy file not found: ${policyFile}`)
    return { code: 1 }
  }

  let loaded: unknown
  try {
    loaded = await import(pathToFileURL(path).href)
  } catch (error) {
    console.log(`✗ failed to load ${policyFile}: ${(error as Error).message}`)
    return { code: 1 }
  }

  const policy = normalizePolicy((loaded as { default?: unknown }).default)
  if (!policy) {
    console.log(
      `✗ ${policyFile} must have a default export of a Rule[] array or a { rules, fallback } Policy object`,
    )
    return { code: 1 }
  }

  if (policy.rules.length === 0) {
    console.log(`✗ ${policyFile} exports a policy with no rules`)
    return { code: 1 }
  }

  console.log(
    `Checking ${policy.rules.length} rule(s) against ${SAMPLE_TOOLS.length} sample call(s)\n`,
  )

  let neverMatched = 0
  for (const rule of policy.rules) {
    for (const pattern of rule.tools) {
      const matched = SAMPLE_TOOLS.some((tool) => matchTool(pattern, tool))
      if (matched) {
        console.log(`  ✓ ${rule.effect}:${pattern} matched at least one sample call`)
      } else {
        neverMatched++
        const suggestion = nearestSampleTool(pattern)
        console.log(
          `  ✗ ${rule.effect}:${pattern} never matched any sample call${
            suggestion ? ` — did you mean "${suggestion}"?` : ''
          }`,
        )
      }
    }
  }

  console.log(
    `\n${
      neverMatched === 0
        ? 'All rules reachable.'
        : `${neverMatched} rule pattern(s) never matched a sample call.`
    }`,
  )

  return { code: neverMatched === 0 ? 0 : 1 }
}
