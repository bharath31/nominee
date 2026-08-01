import { POSTGRES_SCHEMA } from 'nominee-postgres'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer } from '../src/index.js'

const { Pool } = pg

process.env.NOMINEE_RECEIPT_KEY = 'test-receipt-key'

describe('MCP Action Server Integration', () => {
  let pool: pg.Pool

  beforeAll(async () => {
    pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ||
        'postgresql://nominee:password@localhost:5432/nominee_lifecycle',
    })
    await pool.query(POSTGRES_SCHEMA)
  })

  afterAll(async () => {
    await pool.end()
  })

  it('should initialize server and handle approval boundary', async () => {
    const { mcp, nominee } = await createServer(pool)
    expect(mcp).toBeDefined()
    expect(nominee).toBeDefined()

    // Simulate checking a tool
    const result = await nominee.check({
      tool: 'github.commit',
      input: { message: 'test', repo: 'test/repo' },
      user: 'app-user',
    })

    expect(result.effect).toBe('ask')
  })
})
