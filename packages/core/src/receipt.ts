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
  /** Durable action lifecycle identifier. */
  actionId?: string
  /** Application resource and tenant bound to the decision. */
  resource?: string
  tenant?: string
  /** Version of the policy set that made the decision. */
  policyVersion?: string
  /** Policy verdict, for `policy.decision` receipts. */
  effect?: Effect
  /**
   * Present only on receipts written in observe mode: the decision above was
   * recorded but **not enforced**, and the call ran regardless of `effect`.
   * Absent means the decision was enforced.
   */
  enforcement?: 'observe'
  /** Set when an allow-budget escalated the call to ask. */
  escalated?: 'budget'
  /** Compact label of the deciding rule, e.g. `"deny:email.forward"`. */
  rule?: string
  /** Reason recorded by the rule or engine. */
  reason?: string
  /** Approval decision / authz result, when applicable. */
  decision?: string | boolean
  approvalId?: string
  approver?: string
  capabilityId?: string
  outcome?: 'succeeded' | 'failed'
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

export type ReceiptEntry = Omit<Receipt, 'seq' | 'at' | 'prev' | 'hash' | 'inputHash'> & {
  input?: unknown
}

export interface AtomicReceiptOptions {
  key?: string
  inputMode: 'hash' | 'raw' | 'none'
}

/**
 * Cross-process receipt sequencer. `append` must atomically read the current
 * stream tip, assign the next sequence/link, and persist the new receipt.
 */
export interface AtomicReceiptStore {
  readonly durable: boolean
  append(stream: string, entry: ReceiptEntry, options: AtomicReceiptOptions): Promise<Receipt>
  list(stream: string): Promise<Receipt[]>
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
  /**
   * Called with every appended receipt — persist to a file, DB, or log sink.
   * Async sinks are tracked by {@link ReceiptLedger.flush}.
   */
  onReceipt?: (receipt: Receipt) => unknown
  /**
   * `'strict'` makes Nominee's async authorization/token methods wait for
   * `onReceipt` before returning. Default `'buffered'`; call
   * `nominee.flushReceipts()` at checkpoint/shutdown boundaries.
   */
  delivery?: 'buffered' | 'strict'
  /**
   * Atomic cross-process sequencer. Required by `production: true`; the
   * ordinary `onReceipt` callback is delivery, not a serialization point.
   */
  store?: AtomicReceiptStore
  /** Independent hash-chain namespace. Default `"default"`. */
  stream?: string
  /**
   * Continue an existing chain instead of starting a new one — for agents
   * that persist receipts externally and reload across restarts (e.g. a
   * hibernating Durable Object). `seq` is the next sequence number to assign
   * (the count of already-persisted receipts); `prev` is the hash of the
   * last persisted receipt (or `"genesis"` if none exist yet).
   */
  resume?: { seq: number; prev: string }
  /**
   * How many in-memory receipts to expose via `nominee.receipts`.
   * Default 1,000 to keep long-running development processes bounded. Pass
   * `'all'` to retain every in-memory receipt, or use a durable `store` /
   * `onReceipt` sink for an unbounded audit history.
   */
  retain?: number | 'all'
}

export interface VerifyResult {
  ok: boolean
  /** Number of receipts checked. */
  checked: number
  /** True when verification covered only the retained in-memory window. */
  retainedWindow?: boolean
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

/** Build one canonical receipt link for durable store implementations. */
export function sealReceipt(
  entry: ReceiptEntry,
  checkpoint: { seq: number; prev: string; at?: number },
  options: AtomicReceiptOptions,
): Receipt {
  const { input, ...rest } = entry
  const recordedInput: Pick<Receipt, 'input' | 'inputHash'> =
    input === undefined || options.inputMode === 'none'
      ? {}
      : options.inputMode === 'raw'
        ? { input }
        : { inputHash: sha256(canonicalJson(input)) }
  const body: Omit<Receipt, 'hash'> = {
    ...rest,
    ...recordedInput,
    seq: checkpoint.seq,
    at: checkpoint.at ?? Date.now(),
    prev: checkpoint.prev,
  }
  return { ...body, hash: computeHash(body, options.key) }
}

/**
 * Verify a receipt chain (e.g. one exported via {@link ReceiptLedger.toJSONL},
 * or read back from your log sink). Pass the same `key` used to write it.
 *
 * Pass `resume` to verify one segment of a longer chain — e.g. the receipts
 * appended since a hibernating agent last checkpointed — starting from the
 * expected `seq`/`prev` rather than genesis. Verifying the full, concatenated
 * chain from the start needs no `resume`.
 */
export function verifyReceipts(
  receipts: Receipt[],
  opts: { key?: string; resume?: { seq: number; prev: string } } = {},
): VerifyResult {
  let prev = opts.resume?.prev ?? GENESIS
  const baseSeq = opts.resume?.seq ?? 0
  for (let i = 0; i < receipts.length; i++) {
    const r = receipts[i]
    const expectedSeq = baseSeq + i
    if (!r) return { ok: false, checked: i, brokenAt: expectedSeq, reason: 'missing receipt' }
    if (r.seq !== expectedSeq) {
      return {
        ok: false,
        checked: i,
        brokenAt: r.seq,
        reason: `expected seq ${expectedSeq}, got ${r.seq}`,
      }
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
  private retainedBaseSeq: number
  private retainedPrev: string
  private prev: string
  private nextSeq: number
  private readonly baseSeq: number
  private readonly key?: string
  private readonly atomicStore?: AtomicReceiptStore
  private readonly stream: string
  private atomicReceipts: Receipt[] = []
  readonly inputMode: 'hash' | 'raw' | 'none'
  readonly delivery: 'buffered' | 'strict'
  private readonly onReceipt?: (receipt: Receipt) => unknown
  private sinkTail: Promise<unknown> = Promise.resolve()
  private pendingSinkWrites = 0
  private sinkFailed = false
  private readonly retain: number | 'all'

  constructor(options: ReceiptOptions = {}) {
    this.key = options.key
    this.atomicStore = options.store
    this.stream = options.stream ?? 'default'
    this.inputMode = options.input ?? 'hash'
    this.delivery = options.delivery ?? 'buffered'
    this.onReceipt = options.onReceipt
    this.baseSeq = options.resume?.seq ?? 0
    this.nextSeq = this.baseSeq
    this.prev = options.resume?.prev ?? GENESIS
    this.retainedBaseSeq = this.baseSeq
    this.retainedPrev = this.prev
    this.retain = options.retain ?? 1000
    if (this.retain !== 'all' && (!Number.isInteger(this.retain) || this.retain < 1)) {
      throw new Error("nominee: receipts.retain must be a positive integer or 'all'")
    }
  }

  /**
   * Append a record. `input`, when given, is recorded according to the
   * ledger's input mode. Returns the sealed receipt.
   */
  append(entry: ReceiptEntry): Receipt {
    const receipt = sealReceipt(
      entry,
      { seq: this.nextSeq, prev: this.prev },
      { key: this.key, inputMode: this.inputMode },
    )
    this.nextSeq++
    this.receipts.push(receipt)
    this.trimRetained()
    this.prev = receipt.hash
    this.deliver(receipt)
    return receipt
  }

  /**
   * Append through the configured atomic store. Without one, this falls back
   * to the serialized in-process ledger.
   */
  async appendAtomic(entry: ReceiptEntry): Promise<Receipt> {
    if (!this.atomicStore) {
      const receipt = this.append(entry)
      if (this.delivery === 'strict') await this.flush()
      return receipt
    }
    const receipt = await this.atomicStore.append(this.stream, entry, {
      key: this.key,
      inputMode: this.inputMode,
    })
    this.atomicReceipts.push(receipt)
    this.trimAtomicRetained()
    this.deliver(receipt)
    if (this.delivery === 'strict') await this.flush()
    return receipt
  }

  private deliver(receipt: Receipt): void {
    if (!this.onReceipt || this.sinkFailed) return

    if (this.pendingSinkWrites === 0) {
      let result: unknown
      try {
        result = this.onReceipt(receipt)
      } catch (error) {
        this.sinkFailed = true
        this.sinkTail = Promise.reject(error)
        void this.sinkTail.catch(() => {})
        throw error
      }
      if (!isPromiseLike(result)) return
      this.pendingSinkWrites++
      this.sinkTail = Promise.resolve(result)
        .catch((error) => {
          this.sinkFailed = true
          throw error
        })
        .finally(() => {
          this.pendingSinkWrites--
        })
    } else {
      this.pendingSinkWrites++
      this.sinkTail = this.sinkTail
        .then(() => this.onReceipt?.(receipt))
        .catch((error) => {
          this.sinkFailed = true
          throw error
        })
        .finally(() => {
          this.pendingSinkWrites--
        })
    }

    // The rejection remains observable through flush(), but attaching a
    // handler here prevents an unhandled-rejection warning before it is awaited.
    void this.sinkTail.catch(() => {})
  }

  /** All receipts, oldest first. The array is live — copy before mutating. */
  get all(): readonly Receipt[] {
    return [...this.receipts, ...this.atomicReceipts].sort((a, b) => a.seq - b.seq)
  }

  get size(): number {
    return this.receipts.length + this.atomicReceipts.length
  }

  get retainedWindow(): boolean {
    return this.retainedBaseSeq > this.baseSeq
  }

  get durable(): boolean {
    return this.atomicStore?.durable === true
  }

  /** Load the complete atomically-sequenced stream from durable storage. */
  async loadAtomic(): Promise<Receipt[]> {
    return this.atomicStore ? this.atomicStore.list(this.stream) : [...this.receipts]
  }

  async verifyAtomic(): Promise<VerifyResult> {
    return verifyReceipts(await this.loadAtomic(), { key: this.key })
  }

  /** Wait for every async `onReceipt` delivery queued so far. */
  async flush(): Promise<void> {
    await this.sinkTail
  }

  /**
   * Re-verify the receipts this ledger instance appended (hashes, links,
   * sequence). If constructed with `resume`, this verifies the segment
   * starting at that checkpoint — use {@link verifyReceipts} directly on the
   * full persisted history to verify the chain from genesis.
   */
  verify(): VerifyResult {
    const result = verifyReceipts(this.receipts, {
      key: this.key,
      resume: { seq: this.retainedBaseSeq, prev: this.retainedPrev },
    })
    return this.retainedWindow ? { ...result, retainedWindow: true } : result
  }

  /** Export as JSON Lines — one receipt per line, ready for a log pipeline. */
  toJSONL(): string {
    return this.receipts.map((r) => JSON.stringify(r)).join('\n')
  }

  private trimRetained(): void {
    if (this.retain === 'all') return
    while (this.receipts.length > this.retain) {
      const dropped = this.receipts.shift()
      if (!dropped) return
      this.retainedBaseSeq = dropped.seq + 1
      this.retainedPrev = dropped.hash
    }
  }

  private trimAtomicRetained(): void {
    if (this.retain === 'all') return
    while (this.atomicReceipts.length > this.retain) this.atomicReceipts.shift()
  }
}

/** Format a compact, human-readable receipt chain summary. */
export function formatReceipts(receipts: readonly Receipt[]): string {
  if (receipts.length === 0) return 'receipts: none'
  return receipts
    .map((r) => {
      const outcome = r.effect ?? r.decision ?? r.outcome ?? ''
      const parts = [
        `#${r.seq}`,
        r.type,
        r.tool,
        outcome === '' ? undefined : String(outcome),
        r.enforcement === 'observe' ? '(not enforced)' : undefined,
        r.hash.slice(0, 12),
      ].filter(Boolean)
      return parts.join(' ')
    })
    .join('\n')
}

/** Atomic in-process receipt-store conformance implementation. */
export class MemoryAtomicReceiptStore implements AtomicReceiptStore {
  readonly durable = false
  private readonly streams = new Map<string, Receipt[]>()
  private tail: Promise<void> = Promise.resolve()

  async append(
    stream: string,
    entry: ReceiptEntry,
    options: AtomicReceiptOptions,
  ): Promise<Receipt> {
    const previous = this.tail
    let release = () => {}
    this.tail = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
      const receipts = this.streams.get(stream) ?? []
      const tip = receipts.at(-1)
      const receipt = sealReceipt(
        entry,
        { seq: (tip?.seq ?? -1) + 1, prev: tip?.hash ?? GENESIS },
        options,
      )
      receipts.push(receipt)
      this.streams.set(stream, receipts)
      return structuredClone(receipt)
    } finally {
      release()
    }
  }

  async list(stream: string): Promise<Receipt[]> {
    return structuredClone(this.streams.get(stream) ?? [])
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as PromiseLike<unknown>).then === 'function'
  )
}
