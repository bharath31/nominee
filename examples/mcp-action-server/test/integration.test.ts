import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../src/index.js';
import pg from 'pg';

const { Pool } = pg;

describe('MCP Action Server Integration', () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://nominee:password@localhost:5432/nominee_lifecycle'
    });
    // Normally run migrations here, assuming tables exist for the sake of example/test setup
    await pool.query(`
      CREATE TABLE IF NOT EXISTS nominee_actions (
        id VARCHAR PRIMARY KEY,
        data JSONB NOT NULL
      );
      CREATE TABLE IF NOT EXISTS nominee_receipts (
        id VARCHAR PRIMARY KEY,
        data JSONB NOT NULL
      );
    `);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should initialize server and handle approval boundary', async () => {
    const { mcp, nominee } = await createServer(pool);
    expect(mcp).toBeDefined();
    expect(nominee).toBeDefined();
    
    // Simulate checking a tool
    const result = await nominee.check({
      tool: 'github.commit',
      input: { message: 'test', repo: 'test/repo' },
      user: 'app-user'
    });
    
    expect(result.decision).toBe('ask');
  });
});
