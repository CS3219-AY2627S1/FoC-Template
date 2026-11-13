import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SupplierForm } from './SupplierForm'
import { emptySupplierForm } from '../../schemas/supplier.schema'

const renderForm = (onSubmit = vi.fn()) => {
  render(
    <SupplierForm
      defaultValues={emptySupplierForm}
      submitLabel="Add Supplier"
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />,
  )
  return onSubmit
}

describe('SupplierForm', () => {
  it('shows validation errors and does not submit an empty form', async () => {
    const onSubmit = renderForm()
    await userEvent.click(screen.getByRole('button', { name: 'Add Supplier' }))

    expect(await screen.findByText('Please enter a name.')).toBeInTheDocument()
    expect(screen.getByText('Please enter a building.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits trimmed values', async () => {
    const onSubmit = renderForm()
    await userEvent.type(screen.getByLabelText(/Name/), '  Cool Spot ')
    await userEvent.type(screen.getByLabelText(/Building/), 'COM2')
    await userEvent.click(screen.getByRole('button', { name: 'Add Supplier' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      name: 'Cool Spot',
      building: 'COM2',
      category: 'FOOD',
    })
  })
})
