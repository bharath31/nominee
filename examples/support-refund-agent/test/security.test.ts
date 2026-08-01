import { describe, expect, it } from 'vitest'
import { escapeHtml, isAuthorizedApprover } from '../src/security.js'

describe('approval boundary', () => {
  it('escapes all HTML-significant characters', () => {
    expect(escapeHtml(`<img src=x onerror='alert("x")'>&`)).toBe(
      '&lt;img src=x onerror=&#39;alert(&quot;x&quot;)&#39;&gt;&amp;',
    )
  })

  it('rejects missing and incorrect approver credentials', () => {
    expect(isAuthorizedApprover(undefined, 'test-credential')).toBe(false)
    expect(isAuthorizedApprover('Bearer incorrect', 'test-credential')).toBe(false)
    expect(isAuthorizedApprover('Bearer test-credential', undefined)).toBe(false)
    expect(isAuthorizedApprover('Bearer test-credential', 'test-credential')).toBe(true)
  })
})
