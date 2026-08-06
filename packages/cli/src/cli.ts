#!/usr/bin/env node
/**
 * `npx nominee` entry point. Hand-rolled argv parsing — three subcommands
 * don't need a framework.
 */
import { checkPolicy, formatCheckResult } from './check.js'
import { runProof } from './proof.js'
import { verifyFile } from './verify.js'

const [, , command, ...rest] = process.argv

async function main(): Promise<void> {
  switch (command) {
    case undefined:
      await runProof()
      return

    case 'verify': {
      const file = rest[0]
      if (!file) {
        console.error('Usage: nominee verify <file>')
        process.exitCode = 1
        return
      }
      const result = verifyFile(file, { key: process.env.NOMINEE_RECEIPT_KEY })
      console.log(result.message)
      process.exitCode = result.ok ? 0 : 1
      return
    }

    case 'check': {
      const file = rest[0]
      if (!file) {
        console.error('Usage: nominee check <policy-file>')
        process.exitCode = 1
        return
      }
      const result = await checkPolicy(file)
      console.log(formatCheckResult(result))
      process.exitCode = result.ok ? 0 : 1
      return
    }

    // TODO: `nominee console` — local web UI over live policy/receipts. Coming next.
    case 'console':
      console.error('nominee console is not implemented yet — coming next.')
      process.exitCode = 1
      return

    default:
      console.error(
        `Unknown command: ${command}\nUsage: nominee [verify <file> | check <policy-file>]`,
      )
      process.exitCode = 1
  }
}

main().catch((err: Error) => {
  console.error(`✗ ${err.message}`)
  process.exitCode = 1
})
