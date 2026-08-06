/**
 * The generic, metadata-preserving authorizer decision contract this recipe
 * demonstrates, modeled on a relationship-based check: nominee's rule hands
 * the PDP `{ user, relation, object }`, and gets back
 * `{ allowed, reason }` — the shape of OpenFGA / WorkOS FGA's `Check` API
 * once unwrapped from its response envelope (see `checkFgaViaRealFga` below).
 */
export interface FgaCheckRequest {
  user: string
  relation: string
  object: string
}

export interface FgaCheckResponse {
  allowed: boolean
  reason?: string
}

// Toy relationship tuples standing in for an OpenFGA / WorkOS FGA store.
const TUPLES: { user: string; relation: string; object: string }[] = [
  { user: 'alice', relation: 'owner', object: 'document:doc-1' },
  { user: 'bob', relation: 'viewer', object: 'document:doc-1' },
]

/**
 * Mocked, in-process relationship check — no OpenFGA / WorkOS FGA store
 * required to run this example. Async on purpose: a real `Check` call is a
 * network round trip, and nominee's `when` predicates accept
 * `Promise<boolean>` for exactly this reason.
 */
export async function checkFga({
  user,
  relation,
  object,
}: FgaCheckRequest): Promise<FgaCheckResponse> {
  if (TUPLES.some((t) => t.user === user && t.relation === relation && t.object === object)) {
    return { allowed: true, reason: `${user} has relation "${relation}" on ${object}` }
  }
  const held = TUPLES.filter((t) => t.user === user && t.object === object).map((t) => t.relation)
  return {
    allowed: false,
    reason:
      held.length > 0
        ? `${user} lacks relation "${relation}" on ${object} (has: ${held.join(', ')})`
        : `${user} has no relationship to ${object}`,
  }
}

/**
 * Reference only — never called by this example or its test (no network in
 * the demo/CI path). This is the one-line swap to point the same `when`
 * predicate at a real OpenFGA (or WorkOS FGA) store instead of `checkFga`
 * above: same input, same `{ allowed, reason }` output shape. See the
 * README for both the OpenFGA HTTP shape and the WorkOS FGA SDK shape.
 */
export async function checkFgaViaRealFga(request: FgaCheckRequest): Promise<FgaCheckResponse> {
  // OpenFGA: POST /stores/{store_id}/check
  const res = await fetch(
    `${process.env.OPENFGA_API_URL}/stores/${process.env.OPENFGA_STORE_ID}/check`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tuple_key: {
          user: `user:${request.user}`,
          relation: request.relation,
          object: request.object,
        },
      }),
    },
  )
  const body = (await res.json()) as { allowed?: boolean; resolution?: string }
  return { allowed: body.allowed === true, reason: body.resolution }
  // WorkOS FGA SDK equivalent: see README.md.
}
