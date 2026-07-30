/**
 * The policy engine: declarative allow / deny / ask rules over agent tool
 * calls, evaluated in-process before a tool runs.
 *
 * Semantics (kept deliberately small enough to hold in your head):
 *   - Within one policy, rules are evaluated in order; the first rule whose
 *     tool pattern AND `when` predicate match decides. No match → `fallback`
 *     (default `'ask'`).
 *   - Across a delegation chain (orchestrator → sub-agent), every policy in
 *     the chain is evaluated and the STRICTEST outcome wins
 *     (deny > ask > allow). A sub-agent can only ever narrow authority,
 *     never widen it.
 *   - An `allow` rule with `max` is a budget: once it has allowed `max` calls
 *     for a user, further matches escalate to `'ask'` instead of failing —
 *     the human, not the model, decides whether the run keeps going.
 */
import type { BudgetRequirement } from './action.js'

/** What the policy says about a call: run it, refuse it, or ask a human. */
export type Effect = 'allow' | 'deny' | 'ask'

/** A tool call as the policy engine sees it. */
export interface ToolCall {
  /** Tool name, e.g. `"email.forward"`. Matched against rule patterns. */
  tool: string
  /** The tool's input/arguments, available to `when` predicates. */
  input?: unknown
  /** The principal the agent acts on behalf of. */
  user: string
  /** Trusted application tenant boundary, when supplied by the integration. */
  tenant?: string
  /** Trusted application resource identifier, when supplied by the integration. */
  resource?: string
  /** Delegation chain of agent identities, when known. */
  chain?: string[]
}

export interface RuleOptions<TInput = any> {
  /**
   * Argument-level condition: the rule only matches when this returns true.
   * Keep predicates pure and fast — they run on every candidate call. The
   * call's `input` type defaults to `any` (call sites vary by tool); narrow
   * it by passing a type argument, e.g. `allow<{ to: string }>(...)`.
   */
  when?: (call: Omit<ToolCall, 'input'> & { input?: TInput }) => boolean | Promise<boolean>
  /**
   * Budget for `allow` rules: after this rule has allowed `max` calls for a
   * given user, further matches escalate to `'ask'`. Ignored on deny/ask.
   */
  max?: number
  /** Human-readable reason, recorded on the receipt and shown to approvers. */
  reason?: string
  /** For `ask` rules: override the approval timeout for calls gated by this rule. */
  timeoutMs?: number
}

export interface Rule extends RuleOptions {
  effect: Effect
  /** Tool-name patterns; `*` matches any characters (e.g. `"github.*"`). */
  tools: string[]
}

/** Allow matching calls to run without a human in the loop. */
export function allow<TInput = any>(
  tools: string | string[],
  opts: RuleOptions<TInput> = {},
): Rule {
  return { effect: 'allow', tools: Array.isArray(tools) ? tools : [tools], ...opts }
}

/** Refuse matching calls outright — the model cannot talk its way past this. */
export function deny<TInput = any>(tools: string | string[], opts: RuleOptions<TInput> = {}): Rule {
  return { effect: 'deny', tools: Array.isArray(tools) ? tools : [tools], ...opts }
}

/** Pause matching calls until a human approves (via the approval engine). */
export function ask<TInput = any>(tools: string | string[], opts: RuleOptions<TInput> = {}): Rule {
  return { effect: 'ask', tools: Array.isArray(tools) ? tools : [tools], ...opts }
}

export interface Policy {
  rules: Rule[]
  /**
   * Effect when no rule matches. Defaults to `'ask'` — unknown actions reach
   * a human instead of silently running or silently failing. Set `'deny'`
   * for default-deny, or `'allow'` for report-only auditing.
   */
  fallback?: Effect
}

/** The outcome of evaluating a call against a policy chain. */
export interface PolicyDecision {
  /** The policy verdict, before any human approval is sought. */
  effect: Effect
  /** The rule that decided, when one matched (fallback decisions carry none). */
  rule?: Rule
  /** Compact rule label for receipts, e.g. `"deny:email.forward"`. */
  ruleId?: string
  /** Reason from the deciding rule, if any. */
  reason?: string
  /** Set when an exhausted `max` budget escalated an allow to ask. */
  escalated?: 'budget'
  /** Index into the policy chain of the strictest (deciding) policy. */
  policyIndex?: number
  /**
   * Atomic reservations required before a durable action may execute.
   * Populated by {@link PolicyEngine.evaluateForAction}.
   */
  budgets?: BudgetRequirement[]
}

/** `true` when `tool` matches `pattern` (`*` wildcards, case-sensitive). */
export function matchTool(pattern: string, tool: string): boolean {
  if (pattern === '*') return true
  const source = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${source}$`).test(tool)
}

export function ruleId(rule: Rule): string {
  return `${rule.effect}:${rule.tools.join(',')}`
}

const STRICTNESS: Record<Effect, number> = { allow: 0, ask: 1, deny: 2 }

interface PolicyOutcome extends PolicyDecision {
  /** Matched allow-rules with budgets, to commit if the call is finally allowed. */
  budgetKey?: string
  budget?: BudgetRequirement
}

interface BudgetState {
  /** Budget usage per (policy, rule, user). */
  used: Map<string, number>
  /** In-process mutex tail for atomic evaluate-and-commit operations. */
  tail: Promise<void>
}

/**
 * Evaluates calls against an ordered chain of policies (root orchestrator
 * first, acting sub-agent last) and tracks allow-rule budgets.
 */
export class PolicyEngine {
  private readonly budgets: BudgetState

  constructor(
    readonly policies: Policy[],
    budgets: BudgetState = { used: new Map(), tail: Promise.resolve() },
  ) {
    this.budgets = budgets
  }

  /** `true` when at least one policy is configured. */
  get active(): boolean {
    return this.policies.length > 0
  }

  /** Whether every policy in the current chain denies unmatched calls. */
  get defaultDeny(): boolean {
    return this.active && this.policies.every((policy) => policy.fallback === 'deny')
  }

  /** Derive a child engine that appends `policy` to the chain (shares budgets). */
  narrow(policy?: Policy): PolicyEngine {
    return new PolicyEngine(policy ? [...this.policies, policy] : [...this.policies], this.budgets)
  }

  /**
   * Decide a call. Pure with respect to everything except allow-budgets,
   * which are committed only when the final effect is `'allow'` (pass
   * `commit: false` for a side-effect-free preview).
   */
  async evaluate(call: ToolCall, opts: { commit?: boolean } = {}): Promise<PolicyDecision> {
    if (!this.active) return { effect: 'allow', reason: 'no policy configured' }
    if (!this.hasBudgets()) return this.evaluateAndCommit(call, opts.commit !== false)

    if (opts.commit === false) {
      await this.budgets.tail
      return this.evaluateAndCommit(call, false)
    }

    const previous = this.budgets.tail
    let release = () => {}
    this.budgets.tail = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
      return await this.evaluateAndCommit(call, true)
    } finally {
      release()
    }
  }

  /**
   * Evaluate policy without consulting or mutating the process-local counters.
   * Instead, return stable budget requirements for an {@link ActionStore} to
   * reserve atomically with the durable action decision.
   */
  async evaluateForAction(call: ToolCall, policyVersion: string): Promise<PolicyDecision> {
    if (!this.active) return { effect: 'allow', reason: 'no policy configured', budgets: [] }
    const outcomes: PolicyOutcome[] = []
    for (let i = 0; i < this.policies.length; i++) {
      const policy = this.policies[i]
      if (policy) {
        outcomes.push(
          await this.evaluateOne(policy, i, call, {
            deferBudget: true,
            namespace: policyVersion,
          }),
        )
      }
    }

    const strictest = selectStrictest(outcomes)
    if (!strictest) return { effect: 'allow', reason: 'no policy configured', budgets: [] }
    const budgets =
      strictest.effect === 'allow'
        ? outcomes.flatMap((outcome) => (outcome.budget ? [outcome.budget] : []))
        : []
    const { budgetKey: _key, budget: _budget, ...decision } = strictest
    return { ...decision, budgets }
  }

  private async evaluateAndCommit(call: ToolCall, commit: boolean): Promise<PolicyDecision> {
    const outcomes: PolicyOutcome[] = []
    for (let i = 0; i < this.policies.length; i++) {
      const policy = this.policies[i]
      if (policy) outcomes.push(await this.evaluateOne(policy, i, call))
    }

    const strictest = selectStrictest(outcomes)
    if (!strictest) return { effect: 'allow', reason: 'no policy configured' }

    if (strictest.effect === 'allow' && commit) {
      for (const o of outcomes) {
        if (o.budgetKey) {
          this.budgets.used.set(o.budgetKey, (this.budgets.used.get(o.budgetKey) ?? 0) + 1)
        }
      }
    }

    const { budgetKey: _omitted, budget: _budget, ...decision } = strictest
    return decision
  }

  private hasBudgets(): boolean {
    return this.policies.some((policy) =>
      policy.rules.some((rule) => rule.effect === 'allow' && rule.max !== undefined),
    )
  }

  private async evaluateOne(
    policy: Policy,
    policyIndex: number,
    call: ToolCall,
    opts: { deferBudget?: boolean; namespace?: string } = {},
  ): Promise<PolicyOutcome> {
    for (let r = 0; r < policy.rules.length; r++) {
      const rule = policy.rules[r]
      if (!rule) continue
      const matchesName = rule.tools.some((p) => matchTool(p, call.tool))
      if (!matchesName) continue
      if (rule.when && !(await rule.when(call))) continue

      if (rule.effect === 'allow' && rule.max !== undefined) {
        const budgetKey = JSON.stringify([
          opts.namespace ?? 'local',
          policyIndex,
          r,
          call.tenant ?? null,
          call.user,
        ])
        if (!opts.deferBudget && (this.budgets.used.get(budgetKey) ?? 0) >= rule.max) {
          return {
            effect: 'ask',
            rule,
            ruleId: ruleId(rule),
            reason: rule.reason ?? `budget of ${rule.max} calls exhausted`,
            escalated: 'budget',
            policyIndex,
          }
        }
        return {
          effect: 'allow',
          rule,
          ruleId: ruleId(rule),
          reason: rule.reason,
          policyIndex,
          budgetKey,
          budget: { key: budgetKey, limit: rule.max },
        }
      }

      return { effect: rule.effect, rule, ruleId: ruleId(rule), reason: rule.reason, policyIndex }
    }

    const fallback = policy.fallback ?? 'ask'
    return { effect: fallback, reason: `no rule matched (fallback: ${fallback})`, policyIndex }
  }
}

function selectStrictest(outcomes: PolicyOutcome[]): PolicyOutcome | undefined {
  let strictest = outcomes[0]
  if (!strictest) return undefined
  for (const outcome of outcomes) {
    if (STRICTNESS[outcome.effect] > STRICTNESS[strictest.effect]) strictest = outcome
  }
  return strictest
}
