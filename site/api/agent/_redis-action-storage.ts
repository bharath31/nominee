import type { Redis } from '@upstash/redis'
import type { ActionRecordStorage } from './_action-store.js'

// One Durable Object instance backed exactly one agent session, so its
// storage keys (`nominee:action:<id>`, `nominee:capability:<hash>`, ...) were
// implicitly session-scoped. Redis is shared across sessions, so this adapter
// re-prefixes every key with the session id to keep that isolation.
export class RedisActionStorage implements ActionRecordStorage {
  constructor(
    private readonly redis: Redis,
    private readonly sessionId: string,
  ) {}

  private scoped(key: string): string {
    return `nominee:${this.sessionId}:${key.replace(/^nominee:/, '')}`
  }

  async get<T = unknown>(key: string): Promise<T | undefined> {
    const value = await this.redis.get<T>(this.scoped(key))
    return value ?? undefined
  }

  async put<T>(key: string, value: T): Promise<void> {
    await this.redis.set(this.scoped(key), value)
  }

  async delete(key: string): Promise<boolean> {
    const removed = await this.redis.del(this.scoped(key))
    return removed > 0
  }
}
