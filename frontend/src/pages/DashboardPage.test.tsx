/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-5.6-sol), 2026-10-20
 * Scope (AI-19): Rendered and tested the requested dashboard preview.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 */

/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-11-10
 * Scope (AI-65): Added tests for recommended errands show as intended in the dashboard page
 * Author review: Code changes were checked and validated 
 */


import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  loadErrandDashboardBuildings,
  loadOpenErrandDashboard,
  loadRecommendedErrands,
} from '../features/errands/errand.dashboard'
import { acceptErrand } from '../features/errands/errand.api'
import { loadMyErrands } from '../features/errands/errand.view'
import { MOCK_MY_ERRANDS } from '../features/errands/my-errands.mock'
import type { OpenErrandDashboardData } from '../features/errands/errand.dashboard'
import type { ErrandDashboardItem } from '../features/errands/errand.types'
import { DashboardPage } from './DashboardPage'

vi.mock('../features/errands/errand.dashboard', () => ({
  applyDeliveryBuildingNames: (data: OpenErrandDashboardData) => data,
  loadErrandDashboardBuildings: vi.fn(),
  loadOpenErrandDashboard: vi.fn(),
  loadRecommendedErrands: vi.fn(),
  nameDeliveryBuildings: (items: unknown[]) => items,
}))

vi.mock('../features/errands/errand.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../features/errands/errand.api')>()),
  acceptErrand: vi.fn(),
}))

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

const loadOpenErrandDashboardMock = vi.mocked(loadOpenErrandDashboard)
const loadErrandDashboardBuildingsMock = vi.mocked(loadErrandDashboardBuildings)
const loadRecommendedErrandsMock = vi.mocked(loadRecommendedErrands)
const acceptErrandMock = vi.mocked(acceptErrand)
const loadMyErrandsMock = vi.mocked(loadMyErrands)

const openErrand: ErrandDashboardItem = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  status: 'OPEN',
  requester_id: '11111111-1111-4111-8111-111111111111',
  courier_id: null,
  supplier_id: '22222222-2222-4222-8222-222222222222',
  required_item: 'Nasi Lemak + Iced Milo',
  credit_value: 8,
  delivery_building_id: '33333333-3333-4333-8333-333333333333',
  delivery_floor: null,
  delivery_description: 'Meet at the main entrance',
  expires_at: '2026-10-21T04:00:00.000Z',
  created_at: '2026-10-20T04:00:00.000Z',
  accepted_at: null,
  delivered_at: null,
  completed_at: null,
  cancelled_at: null,
  failed_at: null,
  failure_reason: null,
  supplier_name: 'The Deck',
  supplier_building_name: 'Faculty of Arts and Social Sciences',
  delivery_building_name: 'UTown Residence',
}

const secondOpenErrand: ErrandDashboardItem = {
  ...openErrand,
  id: '660e8400-e29b-41d4-a716-446655440000',
  supplier_id: '44444444-4444-4444-8444-444444444444',
  delivery_building_id: '55555555-5555-4555-8555-555555555555',
  required_item: 'Print and bind project report',
  credit_value: 12,
  supplier_name: 'Central Library Printing',
  supplier_building_name: 'Central Library',
  delivery_building_name: 'COM3',
}

const dashboardData: OpenErrandDashboardData = {
  total: 2,
  items: [openErrand, secondOpenErrand],
}

const deliveryBuildings = [
  { id: openErrand.delivery_building_id, name: openErrand.delivery_building_name },
  {
    id: secondOpenErrand.delivery_building_id,
    name: secondOpenErrand.delivery_building_name,
  },
]

const defaultFilters = {
  deliveryBuildingId: '',
  credit: 'all',
  expiry: 'all',
  sort: 'expires_at,asc',
} as const

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  )
}

describe('DashboardPage', () => {
  beforeEach(() => {
    loadOpenErrandDashboardMock.mockReset()
    loadErrandDashboardBuildingsMock.mockReset()
    loadOpenErrandDashboardMock.mockResolvedValue(dashboardData)
    loadErrandDashboardBuildingsMock.mockResolvedValue(deliveryBuildings)
    loadRecommendedErrandsMock.mockReset()
    loadRecommendedErrandsMock.mockResolvedValue([])
    acceptErrandMock.mockReset()
    acceptErrandMock.mockResolvedValue({
      id: openErrand.id,
      status: 'ACCEPTED',
      courier_id: '11111111-1111-4111-8111-111111111111',
      accepted_at: '2026-10-22T04:00:00.000Z',
    })
    loadMyErrandsMock.mockReset()
    loadMyErrandsMock.mockResolvedValue(MOCK_MY_ERRANDS)
  })

  it('shows a loading state before live open errands arrive', async () => {
    let resolveRequest!: (data: OpenErrandDashboardData) => void
    loadOpenErrandDashboardMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve
        }),
    )

    renderPage()

    expect(screen.getByText('Loading open errands…')).toBeInTheDocument()

    await act(async () => resolveRequest(dashboardData))
    expect(
      await screen.findByRole('heading', { name: 'Nasi Lemak + Iced Milo', level: 2 }),
    ).toBeInTheDocument()
  })

  it('renders API-backed card information and friendly status text', async () => {
    renderPage()

    expect(await screen.findByText('2 available')).toBeInTheDocument()
    const nasiLemakCard = screen
      .getAllByRole('article')
      .find((card) => within(card).queryByText('Nasi Lemak + Iced Milo'))

    expect(nasiLemakCard).toBeDefined()
    expect(within(nasiLemakCard!).getByText('The Deck')).toBeInTheDocument()
    expect(within(nasiLemakCard!).getByText('UTown Residence')).toBeInTheDocument()
    expect(within(nasiLemakCard!).getByText('8 credits')).toBeInTheDocument()
    expect(screen.queryByText('OPEN')).not.toBeInTheDocument()
    expect(loadOpenErrandDashboardMock).toHaveBeenCalledWith(
      defaultFilters,
      expect.any(AbortSignal),
    )
  })

  it('requests a new result set when the delivery location changes', async () => {
    renderPage()
    await screen.findByText('2 available')
    await screen.findByRole('option', { name: 'COM3' })

    fireEvent.change(screen.getByLabelText('Filter by delivery location'), {
      target: { value: secondOpenErrand.delivery_building_id },
    })

    await waitFor(() =>
      expect(loadOpenErrandDashboardMock).toHaveBeenLastCalledWith(
        {
          ...defaultFilters,
          deliveryBuildingId: secondOpenErrand.delivery_building_id,
        },
        expect.any(AbortSignal),
      ),
    )
    expect(loadErrandDashboardBuildingsMock).toHaveBeenCalledTimes(1)
  })

  it('requests API-compatible credit and expiry filters', async () => {
    renderPage()
    await screen.findByText('2 available')

    fireEvent.change(screen.getByLabelText('Filter by credit value'), {
      target: { value: '6-to-10' },
    })
    await waitFor(() =>
      expect(loadOpenErrandDashboardMock).toHaveBeenLastCalledWith(
        { ...defaultFilters, credit: '6-to-10' },
        expect.any(AbortSignal),
      ),
    )

    fireEvent.change(screen.getByLabelText('Filter by expiry'), {
      target: { value: 'next-4-hours' },
    })
    await waitFor(() =>
      expect(loadOpenErrandDashboardMock).toHaveBeenLastCalledWith(
        { ...defaultFilters, credit: '6-to-10', expiry: 'next-4-hours' },
        expect.any(AbortSignal),
      ),
    )
  })

  it('requests a new server ordering when the sort changes', async () => {
    renderPage()
    await screen.findByText('2 available')

    fireEvent.change(screen.getByLabelText('Sort errands'), {
      target: { value: 'credit_value,desc' },
    })

    await waitFor(() =>
      expect(loadOpenErrandDashboardMock).toHaveBeenLastCalledWith(
        { ...defaultFilters, sort: 'credit_value,desc' },
        expect.any(AbortSignal),
      ),
    )
  })

  it('shows an empty state and clears incompatible filters', async () => {
    loadOpenErrandDashboardMock.mockResolvedValue({
      total: 0,
      items: [],
    })
    renderPage()
    await screen.findByRole('heading', { name: 'No open errands match' })
    await screen.findByRole('option', { name: 'COM3' })

    fireEvent.change(screen.getByLabelText('Filter by delivery location'), {
      target: { value: secondOpenErrand.delivery_building_id },
    })
    fireEvent.change(screen.getByLabelText('Filter by credit value'), {
      target: { value: '11-plus' },
    })
    await screen.findByRole('heading', { name: 'No open errands match' })
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))

    await waitFor(() =>
      expect(loadOpenErrandDashboardMock).toHaveBeenLastCalledWith(
        defaultFilters,
        expect.any(AbortSignal),
      ),
    )
  })

  it('shows service errors and retries the request', async () => {
    loadOpenErrandDashboardMock
      .mockRejectedValueOnce(new Error('Could not connect to the Order Service.'))
      .mockResolvedValueOnce(dashboardData)
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not connect to the Order Service.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(
      await screen.findByRole('heading', { name: 'Nasi Lemak + Iced Milo', level: 2 }),
    ).toBeInTheDocument()
    expect(loadOpenErrandDashboardMock).toHaveBeenCalledTimes(2)
  })

  it('keeps errands available when building references fail and retries them separately', async () => {
    loadErrandDashboardBuildingsMock
      .mockRejectedValueOnce(new Error('Could not connect to the Supplier Service.'))
      .mockResolvedValueOnce(deliveryBuildings)
    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Nasi Lemak + Iced Milo', level: 2 }),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(/Delivery locations could not be loaded\./),
    ).toBeInTheDocument()
    expect(loadOpenErrandDashboardMock).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Retry locations' }))

    expect(await screen.findByRole('option', { name: 'COM3' })).toBeInTheDocument()
    expect(loadErrandDashboardBuildingsMock).toHaveBeenCalledTimes(2)
    expect(loadOpenErrandDashboardMock).toHaveBeenCalledTimes(1)
  })

  it('cancels the previous request when filters change', async () => {
    loadOpenErrandDashboardMock.mockImplementation(() => new Promise(() => undefined))
    renderPage()
    const firstSignal = loadOpenErrandDashboardMock.mock.calls[0][1]

    fireEvent.change(screen.getByLabelText('Filter by credit value'), {
      target: { value: 'up-to-5' },
    })

    await waitFor(() => expect(firstSignal?.aborted).toBe(true))
  })

  it('shows fixture-backed active errands and links to the full list', async () => {
    renderPage()
    await screen.findByText('2 available')

    const panel = screen.getByRole('complementary')
    expect(within(panel).getByRole('heading', { name: 'Active errands' })).toBeInTheDocument()
    expect(within(panel).getByText('4')).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'View all active errands' })).toHaveAttribute(
      'href',
      '/my-errands',
    )
    expect(screen.getByText('4 errands in progress')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View my errands' })).toHaveAttribute(
      'href',
      '/my-errands',
    )
  })

  it('confirms an errand before moving it from open to active', async () => {
    const acceptedActiveErrand = {
      ...MOCK_MY_ERRANDS[0],
      id: openErrand.id,
      requiredItem: openErrand.required_item,
      role: 'courier' as const,
      progress: 'accepted' as const,
    }
    loadOpenErrandDashboardMock
      .mockResolvedValueOnce(dashboardData)
      .mockResolvedValue({ total: 1, items: [secondOpenErrand] })
    loadMyErrandsMock
      .mockResolvedValueOnce(MOCK_MY_ERRANDS)
      .mockResolvedValue([acceptedActiveErrand, ...MOCK_MY_ERRANDS])
    renderPage()
    await screen.findByText('2 available')

    const openCard = screen
      .getAllByRole('article')
      .find((card) => within(card).queryByText('Nasi Lemak + Iced Milo'))
    expect(openCard).toBeDefined()

    fireEvent.click(within(openCard!).getByRole('button', { name: 'Accept errand' }))
    const dialog = screen.getByRole('dialog', { name: 'Ready to make this delivery?' })
    expect(dialog).toHaveTextContent('The Deck')
    expect(dialog).toHaveTextContent('UTown Residence')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Accept errand' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(acceptErrandMock).toHaveBeenCalledWith(openErrand.id, expect.any(AbortSignal))
    expect(await screen.findByText('1 available')).toBeInTheDocument()
    const panel = screen.getByRole('complementary')
    expect(within(panel).getByText('5')).toBeInTheDocument()
    expect(
      within(panel)
        .getAllByRole('link', { name: 'View details →' })
        .some((link) => link.getAttribute('href') === `/errands/${openErrand.id}`),
    ).toBe(true)
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent(
      'Nasi Lemak + Iced Milo was added to your active errands.',
    )
  })

  it('lets the user leave the acceptance dialog without changing the lists', async () => {
    renderPage()
    await screen.findByText('2 available')

    const openCard = screen
      .getAllByRole('article')
      .find((card) => within(card).queryByText('Print and bind project report'))
    fireEvent.click(within(openCard!).getByRole('button', { name: 'Accept errand' }))
    const dialog = screen.getByRole('dialog', { name: 'Ready to make this delivery?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Go back' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('2 available')).toBeInTheDocument()
  })

  it('shows recommended errands with the reason they were picked', async () => {
    loadRecommendedErrandsMock.mockResolvedValue([
      { ...secondOpenErrand, recommendation_reason: 'Goes to a building you often visit' },
    ])
    loadOpenErrandDashboardMock.mockResolvedValue({ total: 1, items: [openErrand] })

    renderPage()

    const section = await screen.findByRole('region', { name: 'Recommended for you' })
    expect(within(section).getByText('Goes to a building you often visit')).toBeInTheDocument()
    expect(
      within(section).getByRole('heading', { name: 'Print and bind project report' }),
    ).toBeInTheDocument()
  })

  it('hides the recommended section when there is nothing to recommend', async () => {
    renderPage()

    await screen.findByRole('heading', { name: 'Nasi Lemak + Iced Milo', level: 2 })
    expect(screen.queryByRole('region', { name: 'Recommended for you' })).not.toBeInTheDocument()
  })

  it('keeps the open errands list when recommendations fail', async () => {
    loadRecommendedErrandsMock.mockRejectedValue(new Error('Order Service is unavailable'))

    renderPage()

    expect(
      await screen.findByText('Recommendations are unavailable right now.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Nasi Lemak + Iced Milo', level: 2 }),
    ).toBeInTheDocument()
  })
})
