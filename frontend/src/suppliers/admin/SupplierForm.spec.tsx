/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27.
 * Scope: Added a regression test for aligned Supplier opening and closing controls.
 * Author review: Reviewed and approved by @ron.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SupplierForm } from './SupplierForm'
import { EMPTY_SUPPLIER_DRAFT } from './supplierFormModel'

describe('SupplierForm', () => {
  it('bottom-aligns paired time controls when only one field has guidance text', () => {
    render(
      <SupplierForm
        draft={{
          ...EMPTY_SUPPLIER_DRAFT,
          hoursKind: 'INTERVAL',
          opensAt: '09:00',
          closesAt: '17:00',
        }}
        buildings={[]}
        fieldErrors={{}}
        submitting={false}
        submitLabel="Create Supplier"
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    const opensWrapper = screen.getByLabelText('Opens at').parentElement
    const closesWrapper = screen.getByLabelText('Closes at').parentElement

    expect(opensWrapper).toHaveClass('mt-auto', 'pt-2')
    expect(closesWrapper).toHaveClass('mt-auto', 'pt-2')
    expect(opensWrapper?.parentElement).toHaveClass('flex', 'flex-col')
    expect(closesWrapper?.parentElement).toHaveClass('flex', 'flex-col')
  })
})
