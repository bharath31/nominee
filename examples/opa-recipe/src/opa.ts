/**
 * The generic, metadata-preserving authorizer decision contract this recipe
 * demonstrates: nominee's rule hands the PDP `{ user, tool, resource, tenant,
 * input }`, and gets back `{ allow, reason }`. Shaped after OPA's decision
 * document (`{ result: { allow, reason } }` once unwrapped from the HTTP
 * envelope — see `checkOpaViaRealOpa` below).
 */
export interface OpaAuthzRequest {
  user: string
  tool: string
  resource?: string
  tenant?: string
  input?: unknown
}

export interface OpaDecision {
  allow: boolean
  reason?: string
}

// Toy policy data standing in for an OPA bundle: a role per user, and a
// per-role spend ceiling scoped to tenant "acme".
const ROLES: Record<string, string> = {
  alice: 'billing-admin',
  bob: 'support-agent',
}

const SPEND_CEILING: Record<string, number> = {
  'billing-admin': Number.POSITIVE_INFINITY,
  'support-agent': 100,
}

/**
 * Mocked, in-process OPA decision — no server required to run this example.
 * Async on purpose: a real PDP call is a network round trip, and nominee's
 * `when` predicates accept `Promise<boolean>` for exactly this reason.
 */
export async function checkOpa({
  user,
  tool,
  resource,
  tenant,
  input,
}: OpaAuthzRequest): Promise<OpaDecision> {
  const role = ROLES[user] ?? 'guest'
  const ceiling = SPEND_CEILING[role] ?? 0
  const amount = amountOf(input)
  const rule = `data.nominee.${tool.replace(/\./g, '_')}.allow`
  const ceilingLabel = ceiling === Number.POSITIVE_INFINITY ? 'unlimited' : `$${ceiling}`

  if (amount <= ceiling) {
    return {
      allow: true,
      reason: `${rule} = true (role "${role}" in tenant "${tenant ?? 'n/a'}", ceiling ${ceilingLabel}, resource "${resource ?? 'n/a'}")`,
    }
  }
  return {
    allow: false,
    reason: `${rule} = false (role "${role}" capped at ${ceilingLabel}, requested $${amount} on "${resource ?? 'n/a'}")`,
  }
}

function amountOf(input: unknown): number {
  const amount = (input as { amount?: unknown } | undefined)?.amount
  return typeof amount === 'number' && Number.isFinite(amount) ? amount : 0
}

/**
 * Reference only — never called by this example or its test (no network in
 * the demo/CI path). This is the one-line swap to point the same `when`
 * predicate at a real OPA server instead of `checkOpa` above: same input,
 * same `{ allow, reason }` output shape, unwrapped from OPA's `{ result }`
 * envelope. See the README for the request/response shape.
 */
export async function checkOpaViaRealOpa(request: OpaAuthzRequest): Promise<OpaDecision> {
  const res = await fetch(
    `${process.env.OPA_URL}/v1/data/nominee/${request.tool.replace(/\./g, '/')}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: request }),
    },
  )
  const body = (await res.json()) as { result?: { allow?: boolean; reason?: string } }
  return { allow: body.result?.allow === true, reason: body.result?.reason }
}
