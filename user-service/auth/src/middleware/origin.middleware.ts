/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-28
 * Scope: Generated implementation for authentication request origin checks
 * Author review: Verified correctness and correct error codes.
 */

import type { RequestHandler } from 'express'
export const requireSameOrigin: RequestHandler = (req, res, next) => {
  const origin = req.header('origin')
  if (!origin) {
    next()
    return
  } // Non-browser clients do not set Origin.
  const host = req.header('x-forwarded-host') ?? req.header('host')
  const protocol = req.header('x-forwarded-proto') ?? req.protocol
  const expectedOrigin = process.env.AUTH_PUBLIC_ORIGIN ?? (host ? `${protocol}://${host}` : undefined)
  if (origin === expectedOrigin) {
    next()
    return
  }
  res
    .status(403)
    .json({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'Cross-origin requests are not allowed.' },
    })
}
