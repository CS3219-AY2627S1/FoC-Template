import { afterEach, describe, expect, it, vi } from 'vitest'
import { newIdempotencyKey } from './orderApi'

describe('newIdempotencyKey', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses randomUUID where the browser offers it', () => {
    expect(newIdempotencyKey()).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('still makes a valid key over plain HTTP, where randomUUID is missing', () => {
    const real = globalThis.crypto
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => real.getRandomValues(bytes),
    })
    const key = newIdempotencyKey()
    expect(key).toMatch(/^[0-9a-f]{32}$/)
    expect(newIdempotencyKey()).not.toBe(key)
  })
})
