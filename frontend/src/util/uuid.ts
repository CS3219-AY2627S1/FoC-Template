// AI assistance: OpenAI Codex. HTTP demo compatibility for errand retry keys.
export function randomUUID (): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // getRandomValues is also available on HTTP; retain UUID v4 randomness.
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
