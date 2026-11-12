import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { beforeEach, vi } from 'vitest'
import { loadMyErrands } from '../features/errands/errand.view'
import { MOCK_MY_ERRANDS } from '../features/errands/my-errands.mock'
import { MyErrandsPage } from './MyErrandsPage'

vi.mock('../features/errands/errand.view', () => ({
  loadMyErrands: vi.fn(),
}))

vi.mock('../features/auth/useAuth', () => ({
  useAuth: () => ({
    status: 'authenticated',
    currentUserId: '11111111-1111-4111-8111-111111111111',
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}))

const loadMyErrandsMock = vi.mocked(loadMyErrands)

function renderPage() {
  return render(
    <MemoryRouter>
      <MyErrandsPage />
    </MemoryRouter>,
  )
}

describe('MyErrandsPage', () => {
  beforeEach(() => {
    loadMyErrandsMock.mockReset()
    loadMyErrandsMock.mockResolvedValue(MOCK_MY_ERRANDS)
  })

  it('renders active requester and courier errands from the service', async () => {
    renderPage()

    expect(screen.getByRole('heading', { name: 'My errands' })).toBeInTheDocument()
    expect(await screen.findByText('4 active')).toBeInTheDocument()
    expect(screen.getByText('Awaiting confirmation')).toBeInTheDocument()
    expect(screen.getByText('Ready for pickup')).toBeInTheDocument()
    expect(screen.getAllByText('Requester')).toHaveLength(2)
    expect(screen.getAllByText('Courier')).toHaveLength(2)
  })

  it('filters errands by the user role', async () => {
    renderPage()
    await screen.findByText('4 active')

    fireEvent.click(screen.getByRole('button', { name: 'Requesting' }))

    expect(screen.getByText('2 active')).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(2)
    for (const card of screen.getAllByRole('article')) {
      expect(within(card).getByText('Requester')).toBeInTheDocument()
      expect(within(card).queryByText('Courier')).not.toBeInTheDocument()
    }

    fireEvent.click(screen.getByRole('button', { name: 'Delivering' }))

    expect(screen.getByText('2 active')).toBeInTheDocument()
    for (const card of screen.getAllByRole('article')) {
      expect(within(card).getByText('Courier')).toBeInTheDocument()
      expect(within(card).queryByText('Requester')).not.toBeInTheDocument()
    }
  })

  it('exposes the filter state accessibly', async () => {
    renderPage()
    await screen.findByText('4 active')

    const all = screen.getByRole('button', { name: 'All' })
    const requesting = screen.getByRole('button', { name: 'Requesting' })
    expect(all).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(requesting)
    expect(all).toHaveAttribute('aria-pressed', 'false')
    expect(requesting).toHaveAttribute('aria-pressed', 'true')
  })

  it('links each errand to its details route', async () => {
    renderPage()
    await screen.findByText('4 active')

    expect(screen.getAllByRole('link', { name: 'View details →' })[0]).toHaveAttribute(
      'href',
      '/errands/2fdf7658-f477-4a52-94ed-cbbf2447e005',
    )
  })

  it('manually refreshes the list without polling', async () => {
    renderPage()
    await screen.findByText('4 active')

    fireEvent.click(screen.getByRole('button', { name: '↻ Refresh' }))

    await waitFor(() => expect(loadMyErrandsMock).toHaveBeenCalledTimes(2))
  })

  it('shows a service error and retries', async () => {
    loadMyErrandsMock
      .mockRejectedValueOnce(new Error('Could not connect to the Order Service.'))
      .mockResolvedValueOnce(MOCK_MY_ERRANDS)
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not connect to the Order Service.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('4 active')).toBeInTheDocument()
  })
})
