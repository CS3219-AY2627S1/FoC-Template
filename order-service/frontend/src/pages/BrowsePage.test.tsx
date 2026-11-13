import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COURIER_ID, order, page, signIn, stubFetch } from '../test/fixtures'
import { BrowsePage } from './BrowsePage'

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <BrowsePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('BrowsePage', () => {
  beforeEach(() => signIn(COURIER_ID, 'COURIER'))
  afterEach(() => {
    sessionStorage.clear()
    vi.unstubAllGlobals()
  })

  it('lists open errands with their reward, route and a link to the details', async () => {
    const { fetchMock } = stubFetch(() => ({ body: page([order()]) }))
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Collect my printed notes' })).toBeInTheDocument()
    expect(screen.getByText('Courier activity')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Campus errands' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Open campus requests' })).toBeInTheDocument()
    expect(screen.getByLabelText('18 credits reward')).toBeInTheDocument()
    expect(screen.queryByText('Campus errand')).not.toBeInTheDocument()
    expect(screen.getByText('Printers@PCCommons', { selector: '.route-line span' }).parentElement).toHaveTextContent(
      'Printers@PCCommons to PGP Foyer',
    )
    expect(screen.getByText(/Pick up by/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View Collect my printed notes' })).toHaveAttribute(
      'href',
      '/errands/3f2a9c4e-6b1d-4e8f-a7c3-5d9e0b1f2a64',
    )
  })

  it('shows a no-matches message when nothing fits (F4.5)', async () => {
    vi.stubGlobal('fetch', stubFetch(() => ({ body: page([]) })).fetchMock)
    renderPage()

    expect(await screen.findByRole('heading', { name: 'No matching errands' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
  })

  it('shows placeholders while the pool loads', () => {
    vi.stubGlobal('fetch', () => new Promise(() => {}))
    renderPage()

    expect(screen.getByRole('status')).toHaveTextContent('Loading errands…')
  })

  it('offers to clear reward filters that hide every errand', async () => {
    sessionStorage.setItem('foc.errands.browse', JSON.stringify({ minReward: 40, sort: 'reward' }))
    const { fetchMock, calls } = stubFetch(() => ({ body: page([]) }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Clear filters' }))

    await waitFor(() => expect(calls.at(-1)?.url).not.toContain('minReward'))
    expect(calls.at(-1)?.url).toContain('sort=reward')
    expect(screen.getByLabelText('Minimum reward')).toHaveValue(null)
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
  })

  it('sends the chosen filters and sort to the API and remembers them (F4.2-F4.4)', async () => {
    const { fetchMock, calls } = stubFetch(() => ({ body: page([]) }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    const { unmount } = renderPage()
    await screen.findByRole('heading', { name: 'No matching errands' })

    await user.type(screen.getByLabelText('Minimum reward'), '5')
    await user.selectOptions(screen.getByLabelText('Sort by'), 'reward')
    await user.click(screen.getByRole('button', { name: 'Apply filters' }))

    await waitFor(() => expect(calls.at(-1)?.url).toContain('minReward=5'))
    expect(calls.at(-1)?.url).toContain('sort=reward')
    unmount()

    renderPage()
    expect(screen.getByLabelText('Minimum reward')).toHaveValue(5)
    expect(screen.getByLabelText('Sort by')).toHaveValue('reward')
  })

  it('blocks a minimum above the maximum without calling the API', async () => {
    const { fetchMock, calls } = stubFetch(() => ({ body: page([]) }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'No matching errands' })
    const before = calls.length

    await user.type(screen.getByLabelText('Minimum reward'), '9')
    await user.type(screen.getByLabelText('Maximum reward'), '3')
    await user.click(screen.getByRole('button', { name: 'Apply filters' }))

    expect(screen.getByRole('alert')).toHaveTextContent('cannot be more than the maximum')
    expect(calls.length).toBe(before)
  })

  it('reports a failed load', async () => {
    vi.stubGlobal('fetch', stubFetch(() => ({ status: 500, body: { detail: 'Server unavailable' } })).fetchMock)
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Server unavailable')
  })
})
