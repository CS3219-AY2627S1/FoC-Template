/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: Tests for the viewer's part, the action table, item counts and errand wording.
 * Author review: Reviewed and approved by @mattis.
 */
import { describe, expect, it } from 'vitest'
import { getTokenSubject } from '../auth/tokenSubject'
import {
  availableActions,
  describeActor,
  describeRejection,
  formatItemCount,
  formatItemsSummary,
  formatRelative,
  stateGuidance,
  viewerPart,
} from './presentation'
import { COURIER_ID, OTHER_ID, REQUESTER_ID, makeErrand, tokenFor } from './testFixtures'
import { ERRAND_STATES } from './types'

describe('viewerPart', () => {
  const errand = makeErrand({ courierId: COURIER_ID })

  it('recognises the requester and courier regardless of case', () => {
    expect(viewerPart(errand, REQUESTER_ID.toUpperCase())).toBe('requester')
    expect(viewerPart(errand, COURIER_ID)).toBe('courier')
  })

  it('treats anyone else, or an unreadable token, as a visitor', () => {
    expect(viewerPart(errand, OTHER_ID)).toBe('visitor')
    expect(viewerPart(errand, null)).toBe('visitor')
  })
})

describe('availableActions follows the Order Service transition table', () => {
  it('gives each part only its own steps', () => {
    expect(availableActions('OPEN', 'visitor')).toEqual(['accept'])
    expect(availableActions('OPEN', 'requester')).toEqual(['cancel'])
    expect(availableActions('ACCEPTED', 'requester')).toEqual(['cancel'])
    expect(availableActions('ACCEPTED', 'courier')).toEqual(['pickup', 'withdraw'])
    expect(availableActions('PICKED_UP', 'courier')).toEqual(['deliver'])
    expect(availableActions('DELIVERED', 'requester')).toEqual(['confirm', 'reject'])
  })

  it('offers nothing in pending, disputed or terminal states', () => {
    for (const state of ERRAND_STATES) {
      if (['OPEN', 'ACCEPTED', 'PICKED_UP', 'DELIVERED'].includes(state)) continue
      for (const part of ['requester', 'courier', 'visitor'] as const) {
        expect(availableActions(state, part)).toEqual([])
      }
    }
  })

  it('never lets the requester accept, nor a visitor act past OPEN', () => {
    expect(availableActions('OPEN', 'requester')).not.toContain('accept')
    expect(availableActions('ACCEPTED', 'visitor')).toEqual([])
  })
})

describe('wording', () => {
  it('explains each Credit Service rejection code and keeps unknown ones', () => {
    expect(describeRejection('INSUFFICIENT_CREDIT')).toMatch(/enough available credits/)
    expect(describeRejection('SOMETHING_NEW')).toMatch(/SOMETHING_NEW/)
    expect(describeRejection(null)).toMatch(/declined/)
  })

  it('has guidance for every state', () => {
    for (const state of ERRAND_STATES) {
      expect(stateGuidance(makeErrand({ state, confirmDeadline: null }), 'requester')).not.toBe('')
    }
  })

  it('names actors only as far as the history reveals them', () => {
    const errand = makeErrand({ courierId: COURIER_ID })
    const entry = { fromState: null, toState: 'OPEN', action: 'accept', reason: null, at: errand.createdAt } as const
    expect(describeActor({ ...entry, actorType: 'USER', actorId: COURIER_ID }, COURIER_ID, errand)).toBe('You')
    expect(describeActor({ ...entry, actorType: 'USER', actorId: COURIER_ID }, REQUESTER_ID, errand)).toBe('Courier')
    expect(describeActor({ ...entry, actorType: 'USER', actorId: OTHER_ID }, REQUESTER_ID, errand)).toBe('Another member')
    expect(describeActor({ ...entry, actorType: 'USER', actorId: null }, OTHER_ID, errand)).toBeNull()
    expect(describeActor({ ...entry, actorType: 'SYSTEM', actorId: null }, OTHER_ID, errand)).toBe('Automatic')
  })

  it('summarises items and relative times', () => {
    expect(formatItemsSummary([{ name: 'Latte', quantity: 2 }, { name: 'Bun', quantity: 1 }])).toBe('2 × Latte, Bun')
    expect(formatItemCount([{ name: 'Latte', quantity: 2 }, { name: 'Bun', quantity: 1 }])).toBe('3 items')
    expect(formatItemCount([{ name: 'Bun', quantity: 1 }])).toBe('1 item')
    const now = Date.parse('2026-11-09T10:00:00Z')
    expect(formatRelative('2026-11-09T10:30:00Z', now)).toBe('in 30 min')
    expect(formatRelative('2026-11-09T07:00:00Z', now)).toBe('3 h ago')
    expect(formatRelative('2026-11-12T10:00:00Z', now)).toBe('in 3 days')
  })
})

describe('getTokenSubject', () => {
  it('reads and lower-cases sub, and rejects tokens without one', () => {
    expect(getTokenSubject(tokenFor(REQUESTER_ID.toUpperCase()))).toBe(REQUESTER_ID)
    expect(getTokenSubject('not-a-token')).toBeNull()
    expect(getTokenSubject(`x.${btoa('{"exp":1}')}.y`)).toBeNull()
  })
})
