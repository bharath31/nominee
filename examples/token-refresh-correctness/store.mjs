// A durable key-value store backed by a file, standing in for Durable Object
// storage / Workers KV / a DB row. The point: it SURVIVES the pause, exactly
// like state in a hibernating DO. In-memory variables do not — that's the trap.
// nominee reads the refresh token from here and writes the rotated one back.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export class DurableStore {
  constructor(path) {
    this.path = path
    this.data = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}
  }
  get(k) {
    return this.data[k]
  }
  set(k, v) {
    this.data[k] = v
    writeFileSync(this.path, JSON.stringify(this.data, null, 2))
  }
}

/** A clean store for each scenario, so runs are reproducible. Files land in the
 * OS temp dir — running this demo never litters the working directory. */
export function fresh(name) {
  const path = join(tmpdir(), `nominee-token-refresh-${name}`)
  if (existsSync(path)) rmSync(path)
  return new DurableStore(path)
}
