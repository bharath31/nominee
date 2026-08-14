import { offerActivationReport } from './activation.js'
import { runCheck } from './check.js'
import { runObserve } from './observe.js'
import { runProof } from './proof.js'
import { runVerify } from './verify.js'

// Command dispatcher for `npx nominee-cli`. Hand-rolled argv dispatch — three
// subcommands don't need a CLI framework dependency.

const HELP = `nominee — the authorization layer for AI agents

Usage:
  nominee observe            see what a sample agent can do — report only, nothing blocked
  nominee                    run the support-agent policy proof (offline, no keys)
  nominee verify <file>      verify a JSON receipt export's hash chain
  nominee check <policy>     report which rules in a policy file are reachable

Options for observe:
  --out <file>               also write the machine-readable observation report

Options:
  -h, --help                 show this help

Install: npm i nominee
Docs:    https://nominee.dev`

// `nominee console` (a local web UI for live approve/deny + tailing) is
// intentionally out of scope for this pass — see README.md "coming next".
// TODO: nominee console — local HTTP server + approve/deny UI + live tailing.

export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv

  switch (command) {
    case undefined: {
      const result = await runProof()
      if (result.code === 0) await offerActivationReport().catch(() => undefined)
      return result.code
    }

    case 'observe': {
      const outIndex = rest.indexOf('--out')
      const out = outIndex === -1 ? undefined : rest[outIndex + 1]
      if (outIndex !== -1 && !out) {
        console.log('Usage: nominee observe [--out <file>]')
        return 1
      }
      return (await runObserve(out)).code
    }

    case 'verify': {
      const file = rest[0]
      if (!file) {
        console.log('Usage: nominee verify <file>')
        return 1
      }
      return runVerify(file).code
    }

    case 'check': {
      const file = rest[0]
      if (!file) {
        console.log('Usage: nominee check <policy-file>')
        return 1
      }
      return (await runCheck(file)).code
    }

    case 'console':
      console.log(
        'nominee console: not implemented yet (coming next — see packages/cli/README.md).',
      )
      return 1

    case '-h':
    case '--help':
    case 'help':
      console.log(HELP)
      return 0

    default:
      console.log(`nominee: unknown command "${command}"\n`)
      console.log(HELP)
      return 1
  }
}
