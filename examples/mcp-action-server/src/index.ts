import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { Nominee, allow, ask } from 'nominee'
import { registerNomineeTool } from 'nominee-mcp'
import { PostgresControlStore, postgresDatabase } from 'nominee-postgres'
import pg from 'pg'
import { z } from 'zod'

const { Pool } = pg

export async function createServer(pool: pg.Pool) {
  const receiptKey = process.env.NOMINEE_RECEIPT_KEY
  if (!receiptKey) throw new Error('NOMINEE_RECEIPT_KEY must be set')

  const controlStore = new PostgresControlStore(postgresDatabase(pool))
  const nominee = new Nominee({
    policy: {
      rules: [
        ask('github.commit'), // Requires approval boundary
        allow('github.read'),
      ],
      fallback: 'deny',
    },
    receipts: {
      key: receiptKey,
      store: controlStore,
      delivery: 'strict',
    },
    actionStore: controlStore,
    production: true,
    agent: 'mcp-server',
  })

  const mcp = new McpServer({
    name: 'nominee-mcp-example',
    version: '1.0.0',
  })

  registerNomineeTool(mcp, {
    nominee,
    name: 'github.commit',
    description: 'Commit to github',
    inputSchema: z.object({
      message: z.string(),
      repo: z.string(),
    }),
    connection: 'github-oauth', // Distinct transport OAuth
    user: 'app-user', // App auth
    execute: async () => {
      return {
        content: [{ type: 'text', text: 'Commit success: abcdef' }],
      }
    },
  })

  return { mcp, nominee }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL || 'postgresql://nominee:password@localhost:5432/nominee_lifecycle',
  })

  createServer(pool)
    .then(async ({ mcp }) => {
      const transport = new StdioServerTransport()
      await mcp.connect(transport)
    })
    .catch(console.error)

  const shutdown = async () => {
    await pool.end()
    process.exit(0)
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}
