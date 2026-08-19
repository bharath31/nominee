// The `nominee` default command: a pause-proof of the decision-bound lifecycle.
//
// A support agent wants to issue a $200 refund. Policy says a human must
// approve, so `nominee.run()` does not hold the request open: it returns
// immediately with an `actionId` (ActionPendingError) and the approval is
// resolved out of band. While the human is away, the access token the
// framework was holding expires. When the human approves, the action resumes,
// the capability is consumed exactly once, and only then — at execution, not
// plan time — is a fresh token minted.
//
// Every step below is something a framework approval gate cannot do:
//   - the approval request returns without a hung connection;
//   - the plan-time token is observed expiring during the pause;
//   - the credential is minted only after the capability is consumed;
//   - the consumed approval cannot be replayed;
//   - the approved $200 cannot be executed as a $2,000;
//   - the receipt chain verifies, and a doctored copy is detected.
//
// Zero network calls, zero environment variables, and it exits 1 on any
// regression.
import {
  ActionPendingError,
  AuthorizationInputChangedError,
  CapabilityInvalidError,
  Nominee,
  allow,
  ask,
  deny,
  lte,
  tokens,
  verifyReceipts,
} from 'nominee'
import type { ExecuteActionContext } from 'nominee'

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`
const red = (s: string) => `\x1b[31m${s}\x1b[0m`
const green = (s: string) => `\x1b[32m${s}\x1b[0m`
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`

export interface ProofResult {
  /** 0 when every pause, token, and receipt invariant holds; 1 otherwise. */
  code: number
}

interface RefundInput {
  orderId: string
  amount: number
}

interface IssuedToken {
  token: string
  expiresAt: number
}

/**
 * An in-process stand-in for an OAuth2 issuer. Access tokens really do expire
 * (short TTL) and every mint issues a fresh token, the way GitHub, Google,
 * and Okta do — with no HTTP server and no environment variables: just a
 * clock and a map.
 */
function createTokenIssuer(ttlMs: number) {
  const live = new Map<string, IssuedToken>()
  let mints = 0
  let seq = 0
  return {
    get mints(): number {
      return mints
    },
    issue(user: string, connection: string): IssuedToken {
      seq += 1
      mints += 1
      const issued: IssuedToken = {
        token: `tok_${user}_${connection}_${seq}`,
        expiresAt: Date.now() + ttlMs,
      }
      live.set(issued.token, issued)
      return issued
    },
    isValid(token: string): boolean {
      const issued = live.get(token)
      return issued !== undefined && Date.now() < issued.expiresAt
    },
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const REFUND: RefundInput = { orderId: 'ord_42', amount: 200 }
const SWAP: RefundInput = { orderId: 'ord_42', amount: 2_000 }
const CONNECTION = 'stripe'
const SCOPES = ['refunds:write']

/** Run the pause-proof and print it to stdout. */
export async function runProof(): Promise<ProofResult> {
  const refunds: RefundInput[] = []
  const executionTokens: string[] = []

  // Access tokens outlive nothing: they die well before a human replies.
  const issuer = createTokenIssuer(250)

  const nominee = new Nominee({
    agent: 'support-agent',
    policy: {
      rules: [
        allow<RefundInput>('refund.issue', {
          when: lte('amount', 50),
          reason: 'small refunds may run automatically',
        }),
        ask<RefundInput>('refund.issue', {
          when: lte('amount', 500),
          reason: 'a person approves larger refunds',
        }),
        deny('refund.issue', { reason: 'refund is over the agent limit' }),
      ],
      fallback: 'deny',
    },
    receipts: { key: 'demo-signing-key' },
    // Where a real app would notify a human out of band (SMS, push, email).
    // The reply never comes back through this callback — it arrives later via
    // resolveActionApproval — so the request stays pending and returns with
    // an actionId instead of holding the connection open.
    onApprovalRequest: () => undefined,
    strategy: tokens(({ user, connection }) => {
      const issued = issuer.issue(user, connection)
      return { token: issued.token, expiresAt: issued.expiresAt, scopes: SCOPES }
    }),
  })

  // The refund API accepts only a live token. nominee hands the token to this
  // callback; it never receives one earlier.
  const executeRefund = async ({ input, token }: ExecuteActionContext) => {
    const refund = input as RefundInput
    if (!token || !issuer.isValid(token)) {
      throw new Error('the refund API rejected the access token')
    }
    refunds.push(refund)
    executionTokens.push(token)
    return `refunded $${refund.amount} for ${refund.orderId}`
  }

  // The framework's own access token, fetched when the request started.
  const planToken = issuer.issue('alice', CONNECTION)

  console.log(bold('\nA support agent wants to issue a $200 refund.\n'))
  console.log('  allow  refunds up to $50')
  console.log('  ask   refunds up to $500')
  console.log('  deny  larger refunds')
  console.log(dim('  the agent already holds an access token from the start of the request\n'))

  // 1. The agent plans the refund. Policy escalates to a human, and the
  //    request returns immediately instead of hanging.
  let actionId: string | undefined
  try {
    await nominee.run(
      {
        tool: 'refund.issue',
        input: REFUND,
        user: 'alice',
        connection: CONNECTION,
        scopes: SCOPES,
      },
      executeRefund,
    )
    console.log(red('  ✗ $200 REFUND RAN WITHOUT A HUMAN — this line must never print'))
  } catch (error) {
    if (error instanceof ActionPendingError) {
      actionId = error.actionId
      console.log(
        `${green('✓')} approval requested   refund.issue $200 → sent out of band, request returns`,
      )
    } else {
      throw error
    }
  }

  let planTokenExpired = false
  let freshTokenAtExecution = false
  let replayRejected = false

  if (actionId) {
    // 2. The human is away. The plan-time access token expires in the pause.
    await sleep(650)
    planTokenExpired = !issuer.isValid(planToken.token)
    if (planTokenExpired) {
      console.log(
        `${yellow('⏳')} the pause           the access token expires while the human is away`,
      )
    }

    // 3. Approval arrives out of band; the action resumes; the capability is
    //    consumed and only now is a token minted — not at plan time.
    await nominee.resolveActionApproval(actionId, {
      decision: 'approved',
      approver: 'maya@acme.com',
      via: 'sms',
    })
    const resumed = await nominee.resumeAction(actionId)
    if (resumed.status === 'ready') {
      const mintsBeforeExecution = issuer.mints
      await nominee.executeCapability(resumed.capability, REFUND, executeRefund)
      const executedToken = executionTokens[0]
      freshTokenAtExecution =
        mintsBeforeExecution === 1 &&
        issuer.mints === mintsBeforeExecution + 1 &&
        refunds.length === 1 &&
        executedToken !== undefined &&
        executedToken !== planToken.token &&
        issuer.isValid(executedToken)
      if (freshTokenAtExecution) {
        console.log(
          `${green('✓')} approved             fresh token minted at execution, not at plan time`,
        )
      }

      // 4. The same approval, second attempt: the capability was consumed.
      try {
        await nominee.executeCapability(resumed.capability, REFUND, executeRefund)
        console.log(red('  ✗ REPLAYED A CONSUMED APPROVAL — this line must never print'))
      } catch (error) {
        replayRejected = error instanceof CapabilityInvalidError
        if (replayRejected && refunds.length === 1) {
          console.log(`${red('✗')} replay               same approval, second attempt → rejected`)
        }
      }
    }
  }

  // 5. A fresh approval for $200 cannot be executed as a $2,000: the
  //    capability is bound to the exact input a human approved.
  let swapActionId: string | undefined
  try {
    await nominee.run(
      {
        tool: 'refund.issue',
        input: REFUND,
        user: 'alice',
        connection: CONNECTION,
        scopes: SCOPES,
      },
      executeRefund,
    )
  } catch (error) {
    if (error instanceof ActionPendingError) swapActionId = error.actionId
  }
  let argSwapRejected = false
  if (swapActionId) {
    await nominee.resolveActionApproval(swapActionId, {
      decision: 'approved',
      approver: 'maya@acme.com',
      via: 'sms',
    })
    const swap = await nominee.resumeAction(swapActionId)
    if (swap.status === 'ready') {
      try {
        await nominee.executeCapability(swap.capability, SWAP, executeRefund)
        console.log(red('  ✗ APPROVED $200 EXECUTED AS $2,000 — this line must never print'))
      } catch (error) {
        argSwapRejected =
          error instanceof AuthorizationInputChangedError || error instanceof CapabilityInvalidError
        if (argSwapRejected) {
          console.log(`${red('✗')} arg swap             approved $200, executed $2,000 → rejected`)
        }
      }
    }
  }

  // 6. Every step above is sealed into the receipt chain — including the
  //    rejected $2,000 attempt. Delete the approval from a copy and the
  //    chain breaks where it should.
  const verified = nominee.verifyReceipts()
  const approvalReceipt = nominee.receipts.find(
    (receipt) => receipt.type === 'approval.resolved' && receipt.decision === 'approved',
  )
  const doctored = nominee.receipts
    .filter((receipt) => receipt !== approvalReceipt)
    .map((receipt, seq) => ({ ...receipt, seq }))
  const audit = verifyReceipts(doctored, { key: 'demo-signing-key' })
  if (verified.ok && approvalReceipt !== undefined && !audit.ok) {
    console.log(`${green('✓')} receipt chain verifies (and a doctored copy is detected)`)
  }

  console.log(
    dim(
      '\nThe pause is the product: approval out of band, one fresh token at execution,\nand a log that shows if anyone edits it.\n',
    ),
  )
  console.log(bold('Install: npm i nominee'))

  const brokenInvariant =
    actionId === undefined || // $200 ran without a human
    planTokenExpired === false || // the plan-time token survived the pause
    freshTokenAtExecution === false || // no (or extra) mint at execution, or a reused token
    replayRejected === false || // a consumed approval replayed
    swapActionId === undefined || // the second approval path regressed
    argSwapRejected === false || // $2,000 executed on a $200 approval
    !(refunds.length === 1 && refunds[0]?.amount === 200) || // the refund ran the wrong number of times or amount
    !verified.ok ||
    approvalReceipt === undefined || // the approval never made it into the log
    audit.ok // doctored chain went undetected
  return { code: brokenInvariant ? 1 : 0 }
}
