/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-05
 * Scope: Tests for routing/views.js, created for instructions.md Stage 22's "Page-to-view list"
 *        decision ("Which pages each view shows" / "Opening another view's page" rows).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { describe, expect, it } from 'vitest'
import { MAIN_PAGE, NAV_LINKS, VIEWS, VIEW_MODE_LABEL, mainPageFor } from '../../src/routing/views'

describe('routing/views', () => {
  it('maps each view to its main page', () => {
    expect(mainPageFor(VIEWS.REQUESTER)).toBe('/suppliers')
    expect(mainPageFor(VIEWS.COURIER)).toBe('/requests')
    expect(MAIN_PAGE[VIEWS.REQUESTER]).toBe('/suppliers')
    expect(MAIN_PAGE[VIEWS.COURIER]).toBe('/requests')
  })

  it('falls back to the requester main page for an unknown view', () => {
    expect(mainPageFor('nonsense')).toBe('/suppliers')
    expect(mainPageFor(undefined)).toBe('/suppliers')
  })

  it('gives each view exactly its own nav links, main page first', () => {
    expect(NAV_LINKS[VIEWS.REQUESTER].map((l) => l.to)).toEqual(['/suppliers', '/my-errands'])
    expect(NAV_LINKS[VIEWS.COURIER].map((l) => l.to)).toEqual(['/requests', '/my-deliveries'])
  })

  it('names each view\'s mode for the blocked-page message', () => {
    expect(VIEW_MODE_LABEL[VIEWS.REQUESTER]).toBe('requester mode')
    expect(VIEW_MODE_LABEL[VIEWS.COURIER]).toBe('courier mode')
  })
})
