/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Scope: Implementation, refactoring, and test assistance for the recorded frontend work.
 */
import { describe, expect, it } from 'vitest'
import { getAccessTokenSubject, getAccessTokenType } from './auth.token'

function createUnsignedToken(payload: object) {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  return `${encode({ alg: 'none' })}.${encode(payload)}.`
}

describe('getAccessTokenSubject', () => {
  it('reads the user ID from the access-token subject', () => {
    expect(
      getAccessTokenSubject(
        createUnsignedToken({ sub: '33333333-3333-4333-8333-333333333333' }),
      ),
    ).toBe('33333333-3333-4333-8333-333333333333')
  })

  it('returns null for missing, malformed, or non-string subjects', () => {
    expect(getAccessTokenSubject(null)).toBeNull()
    expect(getAccessTokenSubject('not-a-token')).toBeNull()
    expect(getAccessTokenSubject(createUnsignedToken({ type: 'Student' }))).toBeNull()
    expect(getAccessTokenSubject(createUnsignedToken({ sub: 42 }))).toBeNull()
  })
})

describe('getAccessTokenType', () => {
  it('reads supported account types and rejects unknown claims', () => {
    expect(getAccessTokenType(createUnsignedToken({ type: 'Administrator' }))).toBe('Administrator')
    expect(getAccessTokenType(createUnsignedToken({ type: 'Student' }))).toBe('Student')
    expect(getAccessTokenType(createUnsignedToken({ type: 'Other' }))).toBeNull()
    expect(getAccessTokenType('not-a-token')).toBeNull()
  })
})
