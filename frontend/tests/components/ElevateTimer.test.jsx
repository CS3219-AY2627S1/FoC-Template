/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Test for ElevateTimer, per instructions.md Stage 27c. A plain display component (no
 *        state of its own), so the one meaningful case is the mm:ss formatting.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ElevateTimer from '../../src/components/ElevateTimer'

describe('ElevateTimer', () => {
  it('formats seconds as mm:ss, zero-padding seconds under 10', () => {
    render(<ElevateTimer secondsLeft={65} />)
    expect(screen.getByText('Unlocked for 1:05')).toBeInTheDocument()
  })

  it('formats a sub-minute remainder as 0:ss', () => {
    render(<ElevateTimer secondsLeft={9} />)
    expect(screen.getByText('Unlocked for 0:09')).toBeInTheDocument()
  })

  it('formats exactly 15 minutes (the full window) as 15:00', () => {
    render(<ElevateTimer secondsLeft={900} />)
    expect(screen.getByText('Unlocked for 15:00')).toBeInTheDocument()
  })
})
