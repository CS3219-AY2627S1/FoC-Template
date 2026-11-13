import { describe, expect, it, vi } from 'vitest'
import { sessionMiddleware } from '../src/middleware/session.middleware.js'

describe('verified email gate after stateless JWT validation', () => {
  const gate = sessionMiddleware[1]
  it('rejects unverified users', () => {
    const next = vi.fn()
    gate(
      { user: { sub: 'sub', email: 'u@example.com', emailVerified: false, role: 'user' } } as never,
      {} as never,
      next,
    )
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'FORBIDDEN', statusCode: 403 }),
    )
  })
  it('accepts a verified user without profile state', () => {
    const next = vi.fn()
    gate(
      { user: { sub: 'sub', email: 'u@example.com', emailVerified: true, role: 'user' } } as never,
      {} as never,
      next,
    )
    expect(next).toHaveBeenCalledWith()
  })
})
