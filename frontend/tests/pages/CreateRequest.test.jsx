/* AI Assistance Disclosure:
 * Scope (2026-11-08, Codex, model: GPT-6): Updated previous location prompt wording assertions.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-08, Codex, model: GPT-6): Tested reuse prompt dismissal and confirmation.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Tool: Codex (model: GPT-6), date: 2026-11-08
 * Scope: Tests the saved delivery location form per the team spec.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-08, Codex, model: GPT-6): Updated dropdown display assertions.
 * Author review: Congchen
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import CreateRequest from '../../src/pages/CreateRequest'

vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ credits: { available: 10 }, isLoggedIn: true, sessionReady: true }) }))
vi.mock('../../src/api/suppliers', () => ({ listAllSuppliers: () => Promise.resolve({ data: [] }), getSupplier: () => Promise.resolve(null) }))
vi.mock('../../src/api/lastRequest', () => ({ getLastRequest: vi.fn(() => Promise.resolve({ last_req_del_loc_id: 3, last_req_del_loc_details: 'Level 2 lobby' })), saveLastRequest: vi.fn(() => Promise.resolve()) }))
vi.mock('../../src/api/orders', () => ({ createOrder: vi.fn(() => Promise.reject(new Error('Rejected'))), editOrder: vi.fn(() => Promise.resolve()), listMyOrders: vi.fn(() => Promise.resolve({ orders: [{ id: 'abc', supplierId: 1, description: 'Lunch', deliveryLocationId: 3, deliveryDetails: 'Lobby' }] })), reserveFailureMessage: vi.fn() }))
vi.mock('../../src/realtime/orderSocket', () => ({ watchOrderEvents: () => ({ stop: vi.fn() }) }))
vi.mock('../../src/api/useApi', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useReferenceData: () => ({ locations: [{ location_id: 3, location: 'Library' }] }) }
})
import { getLastRequest, saveLastRequest } from '../../src/api/lastRequest'
import { createOrder, editOrder } from '../../src/api/orders'

it('requires details and lets the requester reuse a saved location', async () => {
  render(<MemoryRouter><CreateRequest /></MemoryRouter>)
  await screen.findByText('Your previous location?')
  expect(screen.queryByLabelText(/Exact delivery details/)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Post errand' })).toBeDisabled()
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
  const field = screen.getByLabelText(/Exact delivery details/)
  expect(field).toHaveAttribute('maxLength', '250')
  expect(field).toHaveValue('Level 2 lobby')
  expect(screen.getByLabelText(/Deliver to/)).toHaveValue('Library')
  expect(screen.queryByText('Your previous location?')).not.toBeInTheDocument()
})

it('dismisses the saved location without changing the fields', async () => {
  render(<MemoryRouter><CreateRequest /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }))
  expect(screen.queryByText('Your previous location?')).not.toBeInTheDocument()
  expect(screen.getByLabelText(/Deliver to/)).toHaveValue('Choose a drop-off point')
  expect(screen.getByLabelText(/Exact delivery details/)).toHaveValue('')
})

it('shows the fields when there is no previous location', async () => {
  getLastRequest.mockResolvedValueOnce(null)
  render(<MemoryRouter><CreateRequest /></MemoryRouter>)
  expect(await screen.findByLabelText(/Exact delivery details/)).toBeInTheDocument()
  expect(screen.getByLabelText(/Deliver to/)).toBeInTheDocument()
})

it('saves the trimmed location independently when posting fails', async () => {
  render(<MemoryRouter initialEntries={['/requests/new?supplier=1']}><CreateRequest /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText(/What do you need/), { target: { value: 'Lunch' } })
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
  fireEvent.change(screen.getByLabelText(/Exact delivery details/), { target: { value: '  Lobby  ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Post errand' }))
  expect(saveLastRequest).toHaveBeenCalledWith('3', 'Lobby')
  expect(createOrder).toHaveBeenCalledWith(expect.objectContaining({ deliveryDetails: 'Lobby' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Rejected')
})

it('saves an edit without showing the reuse card', async () => {
  render(<MemoryRouter initialEntries={['/requests/abc/edit']}><Routes><Route path="/requests/:id/edit" element={<CreateRequest />} /><Route path="/my-errands" element={<p>Saved</p>} /></Routes></MemoryRouter>)
  const field = await screen.findByLabelText(/Exact delivery details/)
  expect(screen.queryByText('Your previous location?')).not.toBeInTheDocument()
  fireEvent.change(field, { target: { value: '  Desk  ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(saveLastRequest).toHaveBeenCalledWith('3', 'Desk')
  expect(editOrder).toHaveBeenCalledWith('abc', expect.objectContaining({ deliveryDetails: 'Desk' }))
  expect(await screen.findByText('Saved')).toBeInTheDocument()
})
