import { canonicalJson, hmacSha256, sha256 } from './hash.js'
import type { Effect } from './policy.js'

/**
 * Receipts are nominee's tamper-evident answer to "what did the agent do as
 * me, and who let it?". Every policy decision, approval, and token grant
 * appends one record to a hash chain: each receipt's hash covers its content
 * plus the previous hash, so editing or deleting any record breaks
 * verification of everything after it. With a signing key, hashes become
 * HMACs — only key-holders can forge a chain.
 *
 * By default the tool input is recorded as `inputHash` (SHA-256 of its
 * canonical JSON) — enough to later prove *what the approver saw* without
 * writing user data into logs.
 */
export interface Receipt {
  /** Position in the chain, starting at 0. */
  seq: number
  /** Epoch milliseconds. */
  at: number
  /** What happened, e.g. `"policy.decision"`, `"approval.resolved"`, `"token.issued"`. */
  type: string
  /** The principal the agent acted on behalf of. */
  user: string
  /** The acting agent (leaf of the chain), if configured. */
  agent?: string
  /** Delegation chain of agent identities. */
  chain?: string[]
  /** Tool / action name, for decisions and approvals. */
  tool?: string
  /** Policy verdict, for `policy.decision` receipts. */
  effect?: Effect
  /** Set when an allow-budget escalated the call to ask. */
  escalated?: 'budget'
  /** Compact label of the deciding rule, e.g. `"deny:email.forward"`. */
  rule?: string
  /** Reason recorded by the rule or engine. */
  reason?: string
  /** Approval decision / authz result, when applicable. */
  decision?: string | boolean
  /** Third-party connection, for token receipts. */
  connection?: string
  /** SHA-256 of the canonical-JSON tool input (default input mode `'hash'`). */
  inputHash?: string
  /** Raw tool input (only with input mode `'raw'`). */
  input?: unknown
  /** Free-form extra context. */
  detail?: unknown
  /** Hash of the previous receipt (`"genesis"` for the first). */
  prev: string
  /** SHA-256 (or HMAC-SHA256 when a key is set) of this receipt's canonical content. */
  hash: string
}

export interface ReceiptOptions {
  /**
   * HMAC signing key. Without one the chain is tamper-evident (any edit breaks
   * it) but re-computable; with one, receipts can't be forged without the key.
   */
  key?: string
  /**
   * How tool inputs are recorded: `'hash'` (default — provable, never stores
   * user data), `'raw'` (full input on the receipt), `'none'`.
   */
  input?: 'hash' | 'raw' | 'none'
  /** Called with every appended receipt — persist to a file, DB, or log sink. */
  onReceipt?: (receipt: Receipt) => void
}

export interface VerifyResult {
  ok: boolean
  /** Number of receipts checked. */
  checked: number
  /** Sequence number of the first broken receipt, when !ok. */
  brokenAt?: number
  /** Why verification failed, when !ok. */
  reason?: string
}

const GENESIS = 'genesis'

function computeHash(receipt: Omit<Receipt, 'hash'>, key?: string): string {
  const content = canonicalJson(receipt)
  return key ? hmacSha256(key, content) : sha256(content)
}

/**
 * Verify a receipt chain (e.g. one exported via {@link ReceiptLedger.toJSONL},
 * or read back from your log sink). Pass the same `key` used to write it.
 */
export function verifyReceipts(receipts: Receipt[], opts: { key?: string } = {}): VerifyResult {
  let prev = GENESIS
  for (let i = 0; i < receipts.length; i++) {
    const r = receipts[i]
    if (!r) return { ok: false, checked: i, brokenAt: i, reason: 'missing receipt' }
    if (r.seq !== i) {
      return { ok: false, checked: i, brokenAt: r.seq, reason: `expected seq ${i}, got ${r.seq}` }
    }
    if (r.prev !== prev) {
      return { ok: false, checked: i, brokenAt: r.seq, reason: 'broken chain link (prev mismatch)' }
    }
    const { hash, ...content } = r
    if (computeHash(content, opts.key) !== hash) {
      return { ok: false, checked: i, brokenAt: r.seq, reason: 'content does not match hash' }
    }
    prev = hash
  }
  return { ok: true, checked: receipts.length }
}

/** An append-only, hash-chained log of everything nominee authorized. */
export class ReceiptLedger {
  private receipts: Receipt[] = []
  private prev = GENESIS
  private readonly key?: string
  readonly inputMode: 'hash' | 'raw' | 'none'
  private readonly onReceipt?: (receipt: Receipt) => void

  constructor(options: ReceiptOptions = {}) {
    this.key = options.key
    this.inputMode = options.input ?? 'hash'
    this.onReceipt = options.onReceipt
  }

  /**
   * Append a record. `input`, when given, is recorded according to the
   * ledger's input mode. Returns the sealed receipt.
   */
  append(
    entry: Omit<Receipt, 'seq' | 'at' | 'prev' | 'hash' | 'inputHash'> & { input?: unknown },
  ): Receipt {
    const { input, ...rest } = entry
    const body: Omit<Receipt, 'hash'> = {
      ...rest,
      ...this.recordInput(input),
      seq: this.receipts.length,
      at: Date.now(),
      prev: this.prev,
    }
    const receipt: Receipt = { ...body, hash: computeHash(body, this.key) }
    this.receipts.push(receipt)
    this.prev = receipt.hash
    this.onReceipt?.(receipt)
    return receipt
  }

  private recordInput(input: unknown): Pick<Receipt, 'input' | 'inputHash'> {
    if (input === undefined || this.inputMode === 'none') return {}
    if (this.inputMode === 'raw') return { input }
    return { inputHash: sha256(canonicalJson(input)) }
  }

  /** All receipts, oldest first. The array is live — copy before mutating. */
  get all(): readonly Receipt[] {
    return this.receipts
  }

  get size(): number {
    return this.receipts.length
  }

  /** Re-verify the whole chain (hashes, links, sequence). */
  verify(): VerifyResult {
    return verifyReceipts(this.receipts, { key: this.key })
  }

  /** Export as JSON Lines — one receipt per line, ready for a log pipeline. */
  toJSONL(): string {
    return this.receipts.map((r) => JSON.stringify(r)).join('\n')
  }
}
