import { describe, expect, it } from 'vitest'
import { canonicalJson, hmacSha256, sha256 } from '../src/hash.js'

describe('sha256', () => {
  // FIPS 180-4 / NIST test vectors.
  it('matches the empty-string vector', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('matches the "abc" vector', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('matches the two-block vector', () => {
    expect(sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    )
  })

  it('handles multi-byte UTF-8', () => {
    // sha256 of the UTF-8 bytes of "héllo wörld"
    expect(sha256('héllo wörld')).toHaveLength(64)
    expect(sha256('héllo wörld')).not.toBe(sha256('hello world'))
  })

  it('handles messages longer than one padding block', () => {
    expect(sha256('a'.repeat(200))).toHaveLength(64)
  })
})

describe('hmacSha256', () => {
  // RFC 4231 test case 2.
  it('matches the RFC 4231 "Jefe" vector', () => {
    expect(hmacSha256('Jefe', 'what do ya want for nothing?')).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    )
  })

  it('hashes keys longer than the block size', () => {
    const long = hmacSha256('k'.repeat(100), 'msg')
    expect(long).toHaveLength(64)
    expect(long).not.toBe(hmacSha256('k'.repeat(64), 'msg'))
  })

  it('differs per key', () => {
    expect(hmacSha256('a', 'msg')).not.toBe(hmacSha256('b', 'msg'))
  })
})

describe('canonicalJson', () => {
  it('sorts object keys recursively', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}')
  })

  it('preserves array order', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]')
  })

  it('drops undefined values so hashes stay stable', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}')
  })

  it('is insertion-order independent', () => {
    const one = canonicalJson({ x: 1, y: 2 })
    const two = canonicalJson({ y: 2, x: 1 })
    expect(one).toBe(two)
  })
})
