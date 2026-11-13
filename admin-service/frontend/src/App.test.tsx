import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { App } from './App'
import { navigateTo } from './navigation'

// The header bell polls on its own and has its own tests; keep it out of these fetch sequences.
vi.mock('./components/NotificationBell', () => ({
  NotificationBell: () => null,
}))
vi.mock('./components/NotificationPush', () => ({ NotificationPush: () => null }))
vi.mock('./navigation', () => ({ navigateTo: vi.fn() }))
function mockFetch(fetcher: (url: string, options?: RequestInit) => unknown) {
  vi.stubGlobal('fetch', (url: string, options?: RequestInit) =>
    url.startsWith('/api/admin/cases?')
      ? Promise.resolve({
          ok: true,
          json: async () => ({
            content: [],
            page: 0,
            size: 20,
            totalElements: 0,
            totalPages: 0,
          }),
        })
      : fetcher(url, options),
  )
}
function session(role = 'ADMIN') {
  sessionStorage.setItem(
    'foc.user-session',
    JSON.stringify({
      accessToken: 'signed-token',
      tokenType: 'Bearer',
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      userId: 'actor',
      username: 'Darryl',
      role,
      availableRoles: ['REQUESTER', 'COURIER', 'ADMIN'],
    }),
  )
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
it('shows sign-in without loading protected data', () => {
  const fetcher = vi.fn()
  mockFetch(fetcher)
  render(<App />)
  expect(
    screen.getByRole('heading', { name: 'Sign in to continue' }),
  ).toBeVisible()
  expect(fetcher).not.toHaveBeenCalled()
})
it('opens tools only after live authorization', async () => {
  session()
  mockFetch(
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ userId: 'actor', role: 'ADMIN' }),
    }),
  )
  render(<App />)
  expect(await screen.findByText('Administration tools')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /Manage users/ })).toBeVisible()
  expect(
    screen.getByRole('heading', { name: 'Keep campus running smoothly.' }),
  ).toBeVisible()
  const queue = screen.getByRole('heading', {
    name: 'Cases needing attention',
  })
  const tools = screen.getByRole('heading', { name: 'Administration tools' })
  expect(queue).toBeVisible()
  expect(
    queue.compareDocumentPosition(tools) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
  expect(
    screen.queryByRole('link', { name: 'Participant reports' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('link', { name: 'Reports' }),
  ).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'View all cases' })).toHaveAttribute(
    'href',
    '/admin/cases?status=OPEN',
  )
})
it('builds the Admin overview from live case totals and open cases', async () => {
  session()
  const caseId = '11111111-1111-4111-8111-111111111111'
  const orderId = '22222222-2222-4222-8222-222222222222'
  const page = (totalElements: number, content: unknown[] = []) => ({
    content,
    page: 0,
    size: content.length || 1,
    totalElements,
    totalPages: totalElements ? 1 : 0,
  })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/admin/session')
        return {
          ok: true,
          json: async () => ({ userId: 'actor', role: 'ADMIN' }),
        }
      const body = url.includes('status=OPEN')
        ? page(2, [
            {
              caseId,
              orderId,
              state: 'OPEN',
              reviewerId: null,
              revision: 1,
              createdAt: '2026-11-10T02:25:00Z',
            },
          ])
        : url.includes('status=UNDER_REVIEW')
          ? page(1)
          : url.includes('status=RESOLVED')
            ? page(4)
            : page(7)
      return { ok: true, json: async () => body }
    }),
  )

  render(<App />)

  const openMetric = (await screen.findByText('Open cases')).closest('article')!
  await waitFor(() => expect(within(openMetric).getByText('2')).toBeVisible())
  await waitFor(() =>
    expect(
      within(screen.getByLabelText('Case overview')).getByText('7'),
    ).toBeVisible(),
  )
  expect(
    await screen.findByRole('link', { name: `Review case ${caseId}` }),
  ).toHaveAttribute('href', `/admin/cases/${caseId}?page=0&size=20&status=OPEN`)
})
it('denies a participant without exposing administrative tools', async () => {
  session('REQUESTER')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }))
  render(<App />)
  expect(
    await screen.findByText('This workspace is for administrators'),
  ).toBeVisible()
  expect(
    screen.queryByText('Open account management →'),
  ).not.toBeInTheDocument()
})
it('distinguishes an expired session from dependency failure and retries', async () => {
  session()
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({ ok: false, status: 503 })
    .mockResolvedValueOnce({ ok: false, status: 401 })
  mockFetch(fetcher)
  render(<App />)
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'We couldn’t verify your access',
  )
  fireEvent.click(screen.getByRole('button', { name: /Try again/ }))
  expect(await screen.findByText('Sign in to continue')).toBeVisible()
})
it('removes successful access when the identity changes', async () => {
  session()
  mockFetch(
    vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ userId: 'actor', role: 'ADMIN' }),
      })
      .mockResolvedValue({ ok: false, status: 403 }),
  )
  render(<App />)
  await screen.findByText('Administration tools')
  const s = JSON.parse(sessionStorage.getItem('foc.user-session')!)
  s.accessToken = 'participant-token'
  s.userId = 'participant'
  s.role = 'REQUESTER'
  sessionStorage.setItem('foc.user-session', JSON.stringify(s))
  fireEvent(window, new Event('foc:session-changed'))
  await waitFor(() =>
    expect(screen.queryByText('Administration tools')).not.toBeInTheDocument(),
  )
  expect(
    await screen.findByText('This workspace is for administrators'),
  ).toBeVisible()
})
it('switches workspace through User and rechecks Admin access with the replacement token', async () => {
  session('REQUESTER')
  const replacement = {
    ...JSON.parse(sessionStorage.getItem('foc.user-session')!),
    role: 'ADMIN',
    accessToken: 'admin-token',
  }
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({ ok: false, status: 403 })
    .mockResolvedValueOnce({ ok: true, json: async () => replacement })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ userId: 'actor', role: 'ADMIN' }),
    })
  mockFetch(fetcher)
  render(<App />)
  await screen.findByText('This workspace is for administrators')
  fireEvent.click(screen.getByLabelText('Open account menu for Darryl'))
  fireEvent.click(screen.getByRole('button', { name: 'Switch to Admin' }))
  expect(await screen.findByText('Administration tools')).toBeVisible()
  expect(fetcher).toHaveBeenCalledWith(
    '/api/users/me/session-role',
    expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ role: 'ADMIN' }),
      headers: expect.objectContaining({
        Authorization: 'Bearer signed-token',
      }),
    }),
  )
  expect(fetcher).toHaveBeenLastCalledWith(
    '/api/admin/session',
    expect.objectContaining({
      headers: { Authorization: 'Bearer admin-token' },
    }),
  )
  expect(navigateTo).toHaveBeenCalledWith('/admin')
})
it('keeps access denied when User cannot change the workspace', async () => {
  session('REQUESTER')
  mockFetch(
    vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 403 })
      .mockResolvedValueOnce({ ok: false, status: 503 }),
  )
  render(<App />)
  await screen.findByText('This workspace is for administrators')
  fireEvent.click(screen.getByLabelText('Open account menu for Darryl'))
  fireEvent.click(screen.getByRole('button', { name: 'Switch to Admin' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    "We couldn't switch your role",
  )
  expect(screen.queryByText('Administration tools')).not.toBeInTheDocument()
  expect(
    screen.queryByText('Open account management →'),
  ).not.toBeInTheDocument()
})
