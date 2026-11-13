import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StateBadge } from './StateBadge'

describe('StateBadge', () => {
  it('labels a refused reservation by its reason', () => {
    render(<StateBadge state="RESERVATION_FAILED" terminalReason="INSUFFICIENT_CREDITS" />)
    expect(screen.getByText('Not enough credits')).toBeInTheDocument()
  })

  it('falls back to "Not posted" for other or missing reasons', () => {
    render(<StateBadge state="RESERVATION_FAILED" />)
    expect(screen.getByText('Not posted')).toBeInTheDocument()
  })

  it('labels an errand Credit never confirmed as not posted, not expired', () => {
    render(<StateBadge state="EXPIRED" terminalReason="CREDIT_RESERVATION_TIMEOUT" />)
    expect(screen.getByText('Not posted')).toBeInTheDocument()
  })

  it('keeps "Expired" for an errand whose pickup deadline passed', () => {
    render(<StateBadge state="EXPIRED" terminalReason="PICKUP_DEADLINE_PASSED" />)
    expect(screen.getByText('Expired')).toBeInTheDocument()
  })

  it('labels other states as before', () => {
    render(<StateBadge state="PICKED_UP" terminalReason={null} />)
    expect(screen.getByText('Picked up')).toBeInTheDocument()
  })
})
