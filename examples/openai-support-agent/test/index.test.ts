import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { runScenario } from '../run.mjs'

describe('openai-support-agent scenario', () => {
  test('bridges OpenAI native approval into nominee receipts', async () => {
    const scenario = await runScenario()

    // 1 + 2. The run paused on the ask rule — native SDK interruption.
    assert.equal(scenario.finalOutput, 'Done — closed issue #42 on acme/widgets.')
    assert.ok(scenario.callId, 'the interrupted call must carry an SDK call id')

    // 3. The approved call ran exactly once, with the framework approval sealed.
    assert.deepEqual(scenario.closedIssues, [42, 57])
    assert.equal(scenario.outOfBand.approver, 'dana@acme.com')
    assert.equal(scenario.outOfBand.via, 'email')

    // 4. The mutated replay was refused — and the refusal is in the chain.
    assert.equal(scenario.mutationError?.name, 'AuthorizationInputChangedError')
    assert.equal(scenario.mutationReceipt?.effect, 'deny')

    // 5. The whole chain verifies.
    assert.ok(scenario.chain.ok, 'the receipt chain must verify')
  })
})
