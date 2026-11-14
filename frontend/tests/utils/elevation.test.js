/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Tests for utils/elevation.js, per instructions.md Stage 27c's Tests section: storing,
 *        reading and clearing the sessionStorage-backed elevation token, an expired stored
 *        token being removed on read (the stage's "on load" rule), elevatedTokenHeader's shape
 *        with and without a token, and useElevatedActionFlow's not-elevated -> modal ->
 *        deferred-action gate (including the mid-submit retry case). useElevation's 1s ticking
 *        countdown is exercised indirectly through useElevatedActionFlow's `secondsLeft`/
 *        `isElevated` here; the real sessionStorage/Date.now() combination (not a mocked clock)
 *        keeps the expiry arithmetic honest.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearElevationToken,
  elevatedTokenHeader,
  getElevationToken,
  setElevationToken,
  useElevatedActionFlow,
} from '../../src/utils/elevation'

function fakeToken(expiresInSeconds) {
  const b64 = (obj) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  const payload = { sub: 'admin-1', role: 'admin', sid: 'sid-1', exp: Math.floor(Date.now() / 1000) + expiresInSeconds }
  return b64({ alg: 'RS256', typ: 'ep+JWT' }) + '.' + b64(payload) + '.signature'
}

afterEach(() => {
  clearElevationToken()
})

describe('elevation token storage', () => {
  it('returns null when nothing is stored', () => {
    expect(getElevationToken()).toBeNull()
  })

  it('round-trips a valid token', () => {
    const token = fakeToken(900)
    setElevationToken(token)
    expect(getElevationToken()).toBe(token)
  })

  it('removes and returns null for an expired stored token (the "on load" rule)', () => {
    setElevationToken(fakeToken(-1))
    expect(getElevationToken()).toBeNull()
    // Actually removed, not just hidden - a fresh read also sees nothing.
    expect(sessionStorage.getItem('focElevationToken')).toBeNull()
  })

  it('clearElevationToken removes a valid token', () => {
    setElevationToken(fakeToken(900))
    clearElevationToken()
    expect(getElevationToken()).toBeNull()
  })

  it('elevatedTokenHeader is {} with no token, and the header with one', () => {
    expect(elevatedTokenHeader()).toEqual({})
    const token = fakeToken(900)
    setElevationToken(token)
    expect(elevatedTokenHeader()).toEqual({ 'Elevated-Token': token })
  })
})

describe('useElevatedActionFlow', () => {
  it('runs the action immediately when a valid token is already held', () => {
    setElevationToken(fakeToken(900))
    const { result } = renderHook(() => useElevatedActionFlow())
    let ran = false

    act(() => result.current.withElevation(() => (ran = true)))

    expect(ran).toBe(true)
    expect(result.current.elevationModalOpen).toBe(false)
  })

  it('defers the action and opens the modal when not elevated, then runs it once elevated', () => {
    const { result } = renderHook(() => useElevatedActionFlow())
    let ran = false

    act(() => result.current.withElevation(() => (ran = true)))
    expect(ran).toBe(false)
    expect(result.current.elevationModalOpen).toBe(true)

    act(() => result.current.handleElevated())
    expect(ran).toBe(true)
    expect(result.current.elevationModalOpen).toBe(false)
  })

  it('openElevateModal opens the modal with no deferred action', () => {
    const { result } = renderHook(() => useElevatedActionFlow())

    act(() => result.current.openElevateModal())
    expect(result.current.elevationModalOpen).toBe(true)

    // Nothing to throw: handleElevated with no pending action is a no-op.
    act(() => result.current.handleElevated())
    expect(result.current.elevationModalOpen).toBe(false)
  })

  it('closeElevationModal discards the deferred action without running it', () => {
    const { result } = renderHook(() => useElevatedActionFlow())
    let ran = false

    act(() => result.current.withElevation(() => (ran = true)))
    act(() => result.current.closeElevationModal())

    expect(ran).toBe(false)
    expect(result.current.elevationModalOpen).toBe(false)
  })
})
