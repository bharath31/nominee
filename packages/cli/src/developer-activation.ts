import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { type Policy, type Receipt, type Rule, matchTool, verifyReceipts } from 'nominee'
import { type ActivationOptions, offerDeveloperActivationReport } from './activation.js'

export interface DeveloperActivationResult {
  code: number
}

function normalizePolicy(input: unknown): Policy | undefined {
  if (Array.isArray(input)) return { rules: input as Rule[] }
  if (input && typeof input === 'object' && Array.isArray((input as { rules?: unknown }).rules)) {
    return input as Policy
  }
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validatePolicy(policy: Policy): void {
  if (policy.rules.length === 0) throw new Error('policy has no rules')
  if (
    policy.fallback !== undefined &&
    policy.fallback !== 'allow' &&
    policy.fallback !== 'ask' &&
    policy.fallback !== 'deny'
  ) {
    throw new Error('policy fallback must be allow, ask, or deny')
  }
  for (const [index, rule] of policy.rules.entries()) {
    if (
      !isRecord(rule) ||
      (rule.effect !== 'allow' && rule.effect !== 'ask' && rule.effect !== 'deny') ||
      !Array.isArray(rule.tools) ||
      rule.tools.length === 0 ||
      rule.tools.some((tool) => typeof tool !== 'string' || tool.length === 0)
    ) {
      throw new Error(
        `policy rule #${index + 1} must have an allow/ask/deny effect and at least one tool pattern`,
      )
    }
  }
}

async function loadPolicy(file: string): Promise<Policy> {
  const path = resolve(process.cwd(), file)
  const loaded = (await import(pathToFileURL(path).href)) as { default?: unknown }
  const policy = normalizePolicy(loaded.default)
  if (!policy) throw new Error('policy must default-export a Rule[] or { rules, fallback }')
  validatePolicy(policy)
  return policy
}

async function loadReceipts(file: string): Promise<Receipt[]> {
  const parsed: unknown = JSON.parse(await readFile(resolve(process.cwd(), file), 'utf8'))
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('receipt export must be a non-empty JSON array')
  }
  if (parsed.some((receipt) => !isRecord(receipt))) {
    throw new Error('every receipt must be a JSON object')
  }
  return parsed as Receipt[]
}

function decisionMatchesPolicy(policy: Policy, decision: Receipt, tool: string): boolean {
  if (!decision.rule || (decision.effect !== 'allow' && decision.effect !== 'ask')) return false
  return policy.rules.some(
    (rule) =>
      decision.rule === `${rule.effect}:${rule.tools.join(',')}` &&
      rule.tools.some((pattern) => matchTool(pattern, tool)),
  )
}

function matchingExecution(policy: Policy, receipts: Receipt[]): Receipt | undefined {
  const decisionsByAction = new Map<string, Receipt>()
  for (const receipt of receipts) {
    if (receipt.type === 'policy.decision' && receipt.actionId && receipt.tool) {
      decisionsByAction.set(receipt.actionId, receipt)
      continue
    }
    if (
      receipt.type !== 'execution.succeeded' ||
      receipt.enforcement === 'observe' ||
      !receipt.actionId ||
      !receipt.tool
    ) {
      continue
    }
    const decision = decisionsByAction.get(receipt.actionId)
    if (!decision || decision.tool !== receipt.tool || decision.enforcement === 'observe') continue
    if (decisionMatchesPolicy(policy, decision, receipt.tool)) return receipt
  }
  return undefined
}

/**
 * Prove activation locally, then offer a tiny opt-in signal. Policy and receipt
 * contents never leave this process; the reporter sends only its disclosed
 * three-field payload.
 */
export async function runDeveloperActivation(
  policyFile: string,
  receiptsFile: string,
  options: ActivationOptions = {},
): Promise<DeveloperActivationResult> {
  let policy: Policy
  let receipts: Receipt[]
  try {
    ;[policy, receipts] = await Promise.all([loadPolicy(policyFile), loadReceipts(receiptsFile)])
  } catch (error) {
    console.log(`✗ could not prove developer activation: ${(error as Error).message}`)
    return { code: 1 }
  }

  const key = (options.env ?? process.env).NOMINEE_RECEIPT_KEY
  const verification = verifyReceipts(receipts, key ? { key } : {})
  if (!verification.ok) {
    console.log(
      `✗ could not prove developer activation: receipt chain broken at #${verification.brokenAt} (${verification.reason})`,
    )
    return { code: 1 }
  }

  const execution = matchingExecution(policy, receipts)
  if (!execution) {
    console.log(
      '✗ could not prove developer activation: no enforced execution.succeeded matched a policy rule',
    )
    return { code: 1 }
  }

  console.log(
    `✓ local activation proof: ${policy.rules.length} rule(s), ${verification.checked} intact receipts, ${execution.tool} executed`,
  )
  console.log('  Your policy and receipts stay local; they are never included in the report.')
  // Reporting is advisory. A prompt or output-stream failure must not turn a
  // successful local activation proof into a failed command.
  await offerDeveloperActivationReport(options).catch(() => undefined)
  return { code: 0 }
}
