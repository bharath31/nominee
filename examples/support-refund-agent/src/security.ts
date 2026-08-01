export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      case "'":
        return '&#39;'
      default:
        return character
    }
  })
}

export function isAuthorizedApprover(
  authorization: string | undefined,
  configuredCredential: string | undefined,
): boolean {
  if (!configuredCredential || !authorization?.startsWith('Bearer ')) return false
  return authorization.slice('Bearer '.length) === configuredCredential
}
