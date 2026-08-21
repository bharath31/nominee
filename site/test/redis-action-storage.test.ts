import type { Redis } from '@upstash/redis'
import { describe, expect, it } from 'vitest'
import { RedisActionStorage } from '../api/agent/_redis-action-storage.js'

/** Map-backed stand-in for the Redis client - never touches the network. */
function fakeRedis(): Redis {
  const data = new Map<string, unknown>()
  return {
    async get(key: string) {
      return data.has(key) ? data.get(key) : null
    },
    async set(key: string, value: unknown) {
      data.set(key, value)
      return 'OK'
    },
    async del(...keys: string[]) {
      let removed = 0
      for (const key of keys) if (data.delete(key)) removed++
      return removed
    },
  } as unknown as Redis
}

describe('RedisActionStorage', () => {
  it('round-trips get/put/delete', async () => {
    const store = new RedisActionStorage(fakeRedis(), 'session-1')

    expect(await store.get('nominee:action:a1')).toBeUndefined()

    await store.put('nominee:action:a1', { status: 'planned' })
    expect(await store.get('nominee:action:a1')).toEqual({ status: 'planned' })

    expect(await store.delete('nominee:action:a1')).toBe(true)
    expect(await store.get('nominee:action:a1')).toBeUndefined()
    expect(await store.delete('nominee:action:a1')).toBe(false)
  })

  it('scopes keys per session id so two sessions never collide', async () => {
    const redis = fakeRedis()
    const a = new RedisActionStorage(redis, 'session-a')
    const b = new RedisActionStorage(redis, 'session-b')

    await a.put('nominee:action:same-id', { owner: 'a' })
    await b.put('nominee:action:same-id', { owner: 'b' })

    expect(await a.get('nominee:action:same-id')).toEqual({ owner: 'a' })
    expect(await b.get('nominee:action:same-id')).toEqual({ owner: 'b' })

    await a.delete('nominee:action:same-id')
    expect(await a.get('nominee:action:same-id')).toBeUndefined()
    expect(await b.get('nominee:action:same-id')).toEqual({ owner: 'b' })
  })

  it('scopes the action-index and budget/capability keys the same way', async () => {
    const redis = fakeRedis()
    const a = new RedisActionStorage(redis, 'session-a')
    const b = new RedisActionStorage(redis, 'session-b')

    await a.put('nominee:action-index', ['a1'])
    await a.put('nominee:capability:hash1', 'a1')
    await a.put('nominee:budget:daily', 3)

    expect(await b.get('nominee:action-index')).toBeUndefined()
    expect(await b.get('nominee:capability:hash1')).toBeUndefined()
    expect(await b.get('nominee:budget:daily')).toBeUndefined()

    expect(await a.get('nominee:action-index')).toEqual(['a1'])
    expect(await a.get('nominee:capability:hash1')).toBe('a1')
    expect(await a.get('nominee:budget:daily')).toBe(3)
  })
})
