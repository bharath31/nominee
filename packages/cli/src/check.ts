/**
 * `nominee check <policy-file>` — lints a policy module against a small
 * built-in set of sample tool calls: which rules ever match, which are dead
 * weight (likely typos), same "did you mean" logic nominee's dev-mode
 * warnNeverMatchingRules uses at guard() time.
 */
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Nominee, type Policy, type Rule, matchTool, nearestTool } from 'nominee'

/** A policy module must default-export a `Rule[]`, or an options object carrying `policy`. */
export type PolicyModuleExport = Rule[] | { policy: Policy | Rule[] }

interface SampleCall {
  tool: string
  user: string
  resource?: string
  input?: unknown
}

const SAMPLE_CALLS: SampleCall[] = [
  { tool: 'email.read', user: 'alice' },
  { tool: 'email.forward', user: 'alice', input: { to: 'boss@acme.com' } },
  { tool: 'email.forward', user: 'alice', input: { to: 'attacker@evil.top' } },
  { tool: 'email.delete', user: 'alice', input: { id: 1 } },
  { tool: 'github.get_pr', user: 'alice', resource: 'acme/repo' },
  { tool: 'github.merge_pr', user: 'alice', resource: 'acme/repo' },
  { tool: 'db.query', user: 'alice' },
  { tool: 'file.delete', user: 'alice', input: { path: '/etc/passwd' } },
]

export interface RuleReport {
  pattern: string
  effect: string
  matched: boolean
  suggestion?: string
}

export interface CheckResult {
  ok: boolean
  rules: RuleReport[]
  decisions: { tool: string; user: string; effect: string; rule?: string }[]
}

export async function loadPolicy(file: string): Promise<Policy> {
  const mod = (await import(pathToFileURL(resolve(file)).href)) as { default?: PolicyModuleExport }
  const exported = mod.default
  if (Array.isArray(exported)) return { rules: exported }
  if (exported && typeof exported === 'object' && 'policy' in exported) {
    const policy = exported.policy
    return Array.isArray(policy) ? { rules: policy } : policy
  }
  throw new Error(
    `${file} must default-export a Rule[] array, or an options object with a "policy" property`,
  )
}

export async function checkPolicy(file: string): Promise<CheckResult> {
  const policy = await loadPolicy(file)
  const nominee = new Nominee({ policy, receipts: false })
  const toolNames = SAMPLE_CALLS.map((call) => call.tool)

  const rules: RuleReport[] = []
  for (const rule of policy.rules) {
    for (const pattern of rule.tools) {
      const matched = toolNames.some((tool) => matchTool(pattern, tool))
      rules.push({
        pattern,
        effect: rule.effect,
        matched,
        suggestion: matched ? undefined : nearestTool(pattern, toolNames),
      })
    }
  }

  const decisions: CheckResult['decisions'] = []
  for (const call of SAMPLE_CALLS) {
    const decision = await nominee.check(call)
    decisions.push({
      tool: call.tool,
      user: call.user,
      effect: decision.effect,
      rule: decision.rule ? `${decision.rule.effect}:${decision.rule.tools.join(',')}` : undefined,
    })
  }

  return { ok: rules.every((r) => r.matched), rules, decisions }
}

export function formatCheckResult(result: CheckResult): string {
  const lines: string[] = []
  lines.push('Sample calls:')
  for (const d of result.decisions) {
    lines.push(`  ${d.tool} (${d.user}) → ${d.effect}${d.rule ? ` [${d.rule}]` : ' [fallback]'}`)
  }
  lines.push('')
  lines.push('Rules:')
  for (const r of result.rules) {
    if (r.matched) {
      lines.push(`  ✓ ${r.effect}:${r.pattern} matched at least one sample call`)
    } else {
      lines.push(
        `  ✗ ${r.effect}:${r.pattern} never matched any sample call${
          r.suggestion ? ` — did you mean "${r.suggestion}"?` : ''
        }`,
      )
    }
  }
  return lines.join('\n')
}
