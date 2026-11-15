/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27
 * Scope: Tested distinct administrator authorization, precondition, service,
 * and network feedback for issue #30.
 * Author review: Reviewed and approved by @ron.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { ApiError, NetworkError } from '../../api/client'
import { SupplierFeedback } from './SupplierFeedback'

afterEach(cleanup)

describe('SupplierFeedback', () => {
  it.each([
    [401, 'Session ended'],
    [403, 'Administrator access required'],
    [428, 'Current version required'],
    [503, 'Authentication service temporarily unavailable'],
  ])('distinguishes HTTP %s', (status, heading) => {
    renderFeedback(new ApiError(status, 'CODE', 'Backend message.'))
    expect(screen.getByText(heading)).toBeInTheDocument()
  })

  it('offers reload for a missing ETag and retry for temporary/network failures', () => {
    const { rerender } = renderFeedback(
      new ApiError(428, 'SUPPLIER_PRECONDITION_REQUIRED', 'Current version required.'),
      { onReload: vi.fn() },
    )
    expect(screen.getByRole('button', { name: 'Reload latest' })).toBeInTheDocument()

    rerender(<MemoryRouter><SupplierFeedback error={new NetworkError()} onRetry={vi.fn()} /></MemoryRouter>)
    expect(screen.getByText('Cannot reach the service')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})

function renderFeedback(
  error: unknown,
  callbacks: { readonly onReload?: () => void; readonly onRetry?: () => void } = {},
) {
  return render(
    <MemoryRouter>
      <SupplierFeedback error={error} onReload={callbacks.onReload} onRetry={callbacks.onRetry} />
    </MemoryRouter>,
  )
}
