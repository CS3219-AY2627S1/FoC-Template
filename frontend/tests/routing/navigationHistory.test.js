/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-05
 * Scope: Tests for routing/navigationHistory.js, created for instructions.md Stage 22's chat
 *        back-arrow decision.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { afterEach, describe, expect, it } from 'vitest'
import {
  hasPreviousPage,
  recordNavigation,
  resetNavigationHistory,
} from '../../src/routing/navigationHistory'

afterEach(() => {
  resetNavigationHistory()
})

describe('navigationHistory', () => {
  it('has no previous page before any navigation is recorded', () => {
    expect(hasPreviousPage()).toBe(false)
  })

  it('has a previous page once a navigation is recorded', () => {
    recordNavigation()
    expect(hasPreviousPage()).toBe(true)
  })

  it('resets back to no previous page', () => {
    recordNavigation()
    recordNavigation()
    resetNavigationHistory()
    expect(hasPreviousPage()).toBe(false)
  })
})
