/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-05
 * Scope: Tests for the new admin user-history page (instructions.md Stage 24, F5.3.2): profile
 *        rendering, the whole-page "user not found" on a 404, an empty-orders state, the
 *        orders section's own error+retry, client-side role/status filtering of the current
 *        page, navigating to the order page on a row click, and suspend/promote behaving like
 *        /admin/users (confirm dialog, success toast + in-place profile update, failure toast +
 *        profile reload). getUser/updateUserStatus/updateUserRole, listUserOrders and the
 *        lookups hooks are mocked.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: Stage 26e - the shared ConfirmActionDialog now requires a reason to be selected
 *        before Confirm is enabled; the two "profile actions" tests now select one and assert
 *        it is forwarded to updateUserStatus.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-08, Codex, model: GPT-6): Updated dropdown interaction tests.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 27c of instructions.md - the existing "profile actions" tests run with a valid
 *        elevation fixture (set in beforeEach), since this page's Suspend/Promote buttons now
 *        go through the same gate AdminUsers.jsx does (this page has no Elevate button/timer
 *        of its own, but still needs the gate - see utils/elevation.js's disclosure comment).
 *        Added a new describe block covering the gate: not elevated opens ElevationOtpModal
 *        before the reason dialog, and a mid-submit ELEVATION_REQUIRED retries through the same
 *        dialog, mirroring AdminUsers.test.jsx's equivalent cases.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-fable-5-1), date: 2026-11-10
 * Scope: Stage 30 of instructions.md - added a describe block for the profile email eye icon:
 *        visibility (shown for another user's page incl. pending/suspended/admin; hidden on the
 *        caller's own page and a super admin's), click reveals + icon flips to "hide", second
 *        click re-masks with no request, the 60 s auto re-mask (fake timers), one getFullEmail
 *        call per unmask with only the id, no dialog/OTP modal whether or not elevated, the
 *        failure toast, re-masking after an action replaces the profile, and re-masking after
 *        navigating to an order and back. getFullEmail added to the users API mock.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/Toast'
import AdminUserTransactions from '../../src/pages/AdminUserTransactions'
import { getFullEmail, getUser, updateUserRole, updateUserStatus } from '../../src/api/users'
import { listUserOrders } from '../../src/api/orders'
import * as adminApi from '../../src/api/admin'
import { clearElevationToken, setElevationToken } from '../../src/utils/elevation'

vi.mock('../../src/api/users', () => ({
  getFullEmail: vi.fn(),
  getUser: vi.fn(),
  updateUserStatus: vi.fn(),
  updateUserRole: vi.fn(),
}))

vi.mock('../../src/api/admin', () => ({
  sendAdminOtp: vi.fn(),
  verifyAdminOtp: vi.fn(),
  resendAdminOtp: vi.fn(),
}))

function fakeToken(expiresInSeconds = 900) {
  const b64 = (obj) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  const payload = { sub: 'admin-1', role: 'admin', sid: 'sid-1', exp: Math.floor(Date.now() / 1000) + expiresInSeconds }
  return b64({ alg: 'RS256', typ: 'ep+JWT' }) + '.' + b64(payload) + '.signature'
}

vi.mock('../../src/api/orders', () => ({
  listUserOrders: vi.fn(),
}))

vi.mock('../../src/api/lookups', () => ({
  useUserName: () => null,
  useSupplier: () => null,
}))

const VIEWER = { id: 'admin-1', username: 'admin', role: 'admin' }
vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: VIEWER, isLoggedIn: true, sessionReady: true, requireAuth: vi.fn() }),
}))

function profile(overrides) {
  return {
    id: 'user-1',
    username: 'alice',
    email: 'alice@example.com',
    status: 'active',
    role: 'user',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function order(overrides) {
  return {
    id: 'order-aaaaaaaa-1111',
    requesterId: 'user-1',
    supplierId: 1,
    credits: 10,
    status: 'completed',
    courierId: 'user-2',
    ...overrides,
  }
}

function ordersPage(entries, overrides) {
  return {
    totalCount: entries.length,
    currentPage: 1,
    pageSize: 10,
    totalPages: 1,
    orders: entries,
    ...overrides,
  }
}

// Stands in for the order page so a test can leave the user page and come back to it.
function OrderPageStub() {
  const navigate = useNavigate()
  return (
    <div>
      <p>Order history page</p>
      <button type="button" onClick={() => navigate(-1)}>
        Back to user
      </button>
    </div>
  )
}

function renderPage(initialEntries = ['/admin/user-transactions/user-1']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <ToastProvider>
        <Routes>
          <Route path="/admin/users" element={<p>Admin users page</p>} />
          <Route path="/admin/user-transactions/:userId" element={<AdminUserTransactions />} />
          <Route
            path="/admin/user-transactions/:userId/:requestId"
            element={<OrderPageStub />}
          />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  setElevationToken(fakeToken())
})

afterEach(() => {
  vi.useRealTimers()
  clearElevationToken()
})

describe('AdminUserTransactions profile section', () => {
  it('shows the profile fields', async () => {
    getUser.mockResolvedValue(profile())
    listUserOrders.mockResolvedValue(ordersPage([]))
    renderPage()

    expect(await screen.findByRole('heading', { name: 'alice' })).toBeInTheDocument()
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
    expect(screen.getByText('active')).toBeInTheDocument()
  })

  it('a 404 on the profile call shows "User not found" for the whole page', async () => {
    getUser.mockRejectedValue({ status: 404, message: 'not found' })
    listUserOrders.mockResolvedValue(ordersPage([]))
    renderPage()

    expect(await screen.findByText('User not found')).toBeInTheDocument()
    expect(screen.queryByText('Orders')).not.toBeInTheDocument()
  })

  it('a malformed/nonexistent user id shows the same "User not found" view', async () => {
    getUser.mockRejectedValue({ status: 404, message: 'not found' })
    listUserOrders.mockResolvedValue(ordersPage([]))
    renderPage(['/admin/user-transactions/not-a-real-id'])

    expect(await screen.findByText('User not found')).toBeInTheDocument()
  })
})

describe('AdminUserTransactions orders section', () => {
  it('a user with no orders shows an empty state', async () => {
    getUser.mockResolvedValue(profile())
    listUserOrders.mockResolvedValue(ordersPage([]))
    renderPage()

    expect(await screen.findByText('No orders yet')).toBeInTheDocument()
  })

  it('an order-service failure errors only the orders section, with a working retry', async () => {
    getUser.mockResolvedValue(profile())
    listUserOrders.mockRejectedValueOnce({ status: 503, message: 'Order service unavailable.' })
    listUserOrders.mockResolvedValueOnce(ordersPage([{ order: order(), role: 'requester' }]))
    renderPage()

    expect(await screen.findByRole('heading', { name: 'alice' })).toBeInTheDocument()
    expect(await screen.findByText('Order service unavailable.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(listUserOrders).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('cell', { name: 'Completed' })).toBeInTheDocument()
  })

  it('role and status filters narrow the current page, and the UI says so', async () => {
    getUser.mockResolvedValue(profile())
    listUserOrders.mockResolvedValue(
      ordersPage([
        { order: order({ id: 'order-req', status: 'completed' }), role: 'requester' },
        { order: order({ id: 'order-cour', status: 'open' }), role: 'courier' },
      ]),
    )
    renderPage()

    expect(await screen.findByRole('cell', { name: 'Completed' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Open' })).toBeInTheDocument()

    fireEvent.focus(screen.getByLabelText('Filter by role'))
    fireEvent.click(screen.getByRole('option', { name: /Courier/i }))

    expect(screen.queryByRole('cell', { name: 'Completed' })).not.toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Open' })).toBeInTheDocument()
    expect(screen.getByText('Filters apply to this page of orders only.')).toBeInTheDocument()
  })

  it('clicking an order row opens the order history page', async () => {
    getUser.mockResolvedValue(profile())
    listUserOrders.mockResolvedValue(ordersPage([{ order: order(), role: 'requester' }]))
    renderPage()

    const cell = await screen.findByText('order-aa')
    fireEvent.click(cell.closest('tr'))

    expect(await screen.findByText('Order history page')).toBeInTheDocument()
  })

  it('keeps the page number across a reload via the URL', async () => {
    getUser.mockResolvedValue(profile())
    listUserOrders.mockResolvedValue(ordersPage([], { currentPage: 2, totalPages: 3 }))
    renderPage(['/admin/user-transactions/user-1?page=2'])

    await screen.findByRole('heading', { name: 'alice' })
    await waitFor(() => expect(listUserOrders).toHaveBeenCalledWith('user-1', 2))
  })
})

describe('AdminUserTransactions profile actions', () => {
  it('suspending shows the confirm dialog, then a success toast and updates the profile in place', async () => {
    getUser.mockResolvedValue(profile({ status: 'active' }))
    listUserOrders.mockResolvedValue(ordersPage([]))
    updateUserStatus.mockResolvedValue(profile({ status: 'suspended' }))
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Suspend' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    fireEvent.focus(screen.getByLabelText('Reason'))
    fireEvent.click(screen.getByRole('option', { name: /Fraud or scam/i }))
    const suspendButtons = screen.getAllByRole('button', { name: 'Suspend' })
    fireEvent.click(suspendButtons[suspendButtons.length - 1])

    expect(await screen.findByRole('status')).toHaveTextContent('alice was suspended.')
    expect(updateUserStatus).toHaveBeenCalledWith('user-1', 'suspended', { reason: 'FRAUD_OR_SCAM' })
    expect(getUser).toHaveBeenCalledTimes(1) // no reload needed on success
  })

  it('a failed action shows an error toast and reloads the profile', async () => {
    getUser.mockResolvedValue(profile({ status: 'active' }))
    listUserOrders.mockResolvedValue(ordersPage([]))
    updateUserStatus.mockRejectedValue({ code: 'USER_NOT_FOUND' })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Suspend' }))
    fireEvent.focus(screen.getByLabelText('Reason'))
    fireEvent.click(screen.getByRole('option', { name: /Fraud or scam/i }))
    const suspendButtons = screen.getAllByRole('button', { name: 'Suspend' })
    fireEvent.click(suspendButtons[suspendButtons.length - 1])

    expect(await screen.findByRole('status')).toHaveTextContent('That user could not be found.')
    await waitFor(() => expect(getUser).toHaveBeenCalledTimes(2))
  })
})

describe('AdminUserTransactions elevation (Stage 27c)', () => {
  it('not elevated: clicking Suspend opens the OTP modal before the reason dialog', async () => {
    clearElevationToken()
    getUser.mockResolvedValue(profile({ status: 'active' }))
    listUserOrders.mockResolvedValue(ordersPage([]))
    adminApi.sendAdminOtp.mockResolvedValue({ message: 'sent', code: 'OTP_SENT' })
    adminApi.verifyAdminOtp.mockResolvedValue({ elevationToken: fakeToken() })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Suspend' }))

    expect(screen.getByRole('dialog', { name: 'Verify your identity' })).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send code' })))
    await act(async () => {
      screen.getAllByRole('textbox').forEach((input, i) => fireEvent.change(input, { target: { value: String(i) } }))
    })

    expect(screen.queryByRole('dialog', { name: 'Verify your identity' })).not.toBeInTheDocument()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('a mid-submit ELEVATION_REQUIRED keeps the reason dialog open and retries after verifying', async () => {
    getUser.mockResolvedValue(profile({ status: 'active' }))
    listUserOrders.mockResolvedValue(ordersPage([]))
    // api/users.js is mocked wholesale here, so simulate its real side effect of clearing the
    // stored token on ELEVATION_REQUIRED (see tests/api/users.test.js for that behaviour).
    updateUserStatus.mockImplementationOnce(() => {
      clearElevationToken()
      return Promise.reject({ code: 'ELEVATION_REQUIRED' })
    })
    updateUserStatus.mockResolvedValueOnce(profile({ status: 'suspended' }))
    adminApi.sendAdminOtp.mockResolvedValue({ message: 'sent', code: 'OTP_SENT' })
    adminApi.verifyAdminOtp.mockResolvedValue({ elevationToken: fakeToken() })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Suspend' }))
    fireEvent.focus(screen.getByLabelText('Reason'))
    fireEvent.click(screen.getByRole('option', { name: /Fraud or scam/i }))
    const suspendButtons = screen.getAllByRole('button', { name: 'Suspend' })
    fireEvent.click(suspendButtons[suspendButtons.length - 1])

    expect(await screen.findByRole('dialog', { name: 'Verify your identity' })).toBeInTheDocument()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send code' })))
    await act(async () => {
      screen.getAllByRole('textbox').forEach((input, i) => fireEvent.change(input, { target: { value: String(i) } }))
    })

    await waitFor(() => expect(updateUserStatus).toHaveBeenCalledTimes(2))
    expect(updateUserStatus).toHaveBeenNthCalledWith(2, 'user-1', 'suspended', { reason: 'FRAUD_OR_SCAM' })
    expect(await screen.findByRole('status')).toHaveTextContent('alice was suspended.')
  })
})

describe('AdminUserTransactions profile email eye icon (Stage 30)', () => {
  const MASKED = 'a***@example.com'
  const FULL = 'alice@example.com'

  async function renderUnmasked() {
    getUser.mockResolvedValue(profile({ email: MASKED }))
    listUserOrders.mockResolvedValue(ordersPage([]))
    const emailPromise = Promise.resolve({ email: FULL })
    getFullEmail.mockReturnValueOnce(emailPromise)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Show email for alice' }))
    await act(async () => {
      await emailPromise
    })
    expect(screen.getByText(FULL)).toBeInTheDocument()
  }

  it.each([
    ['pending user', profile({ status: 'pending' })],
    ['suspended user', profile({ status: 'suspended' })],
    ['admin', profile({ role: 'admin' })],
  ])('shows the eye icon on another user\'s page (%s)', async (_label, p) => {
    getUser.mockResolvedValue(p)
    listUserOrders.mockResolvedValue(ordersPage([]))
    renderPage()
    expect(await screen.findByRole('button', { name: 'Show email for alice' })).toBeInTheDocument()
  })

  it('hides the eye icon on the caller\'s own page', async () => {
    getUser.mockResolvedValue(profile({ id: VIEWER.id, username: 'admin', role: 'admin' }))
    listUserOrders.mockResolvedValue(ordersPage([]))
    renderPage(['/admin/user-transactions/' + VIEWER.id])
    await screen.findByRole('heading', { name: 'admin' })
    expect(screen.queryByRole('button', { name: /email for/ })).not.toBeInTheDocument()
  })

  it('hides the eye icon on a super admin\'s page', async () => {
    getUser.mockResolvedValue(profile({ id: 'sa-1', username: 'root', role: 'super admin' }))
    listUserOrders.mockResolvedValue(ordersPage([]))
    renderPage(['/admin/user-transactions/sa-1'])
    await screen.findByRole('heading', { name: 'root' })
    expect(screen.queryByRole('button', { name: /email for/ })).not.toBeInTheDocument()
  })

  it('click reveals the full email with one id-only request and flips to "hide"; click again re-masks with no request', async () => {
    await renderUnmasked()
    expect(getFullEmail).toHaveBeenCalledTimes(1)
    expect(getFullEmail).toHaveBeenCalledWith('user-1')
    expect(screen.queryByText(MASKED)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Hide email for alice' }))
    expect(screen.getByText(MASKED)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show email for alice' })).toBeInTheDocument()
    expect(getFullEmail).toHaveBeenCalledTimes(1)
  })

  it('shows no reason dialog or OTP modal on unmask, even when not elevated', async () => {
    clearElevationToken()
    await renderUnmasked()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(adminApi.sendAdminOtp).not.toHaveBeenCalled()
  })

  it('auto re-masks 60 seconds after unmasking, with no request', async () => {
    getUser.mockResolvedValue(profile({ email: MASKED }))
    listUserOrders.mockResolvedValue(ordersPage([]))
    const emailPromise = Promise.resolve({ email: FULL })
    getFullEmail.mockReturnValueOnce(emailPromise)
    renderPage()
    const eye = await screen.findByRole('button', { name: 'Show email for alice' })

    vi.useFakeTimers()
    fireEvent.click(eye)
    await act(async () => {
      await emailPromise
    })
    expect(screen.getByText(FULL)).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(59_999)
    })
    expect(screen.getByText(FULL)).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getByText(MASKED)).toBeInTheDocument()
    expect(getFullEmail).toHaveBeenCalledTimes(1)
  })

  it('a failed unmask shows a toast and leaves the email masked', async () => {
    getUser.mockResolvedValue(profile({ email: MASKED }))
    listUserOrders.mockResolvedValue(ordersPage([]))
    getFullEmail.mockRejectedValueOnce({ code: 'NETWORK_ERROR' })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Show email for alice' }))

    expect(await screen.findByRole('status')).toBeInTheDocument()
    expect(screen.getByText(MASKED)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show email for alice' })).toBeInTheDocument()
  })

  it('re-masks when an action replaces the profile (suspend)', async () => {
    await renderUnmasked()
    updateUserStatus.mockResolvedValue(profile({ email: MASKED, status: 'suspended' }))

    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }))
    fireEvent.focus(screen.getByLabelText('Reason'))
    fireEvent.click(screen.getByRole('option', { name: /Fraud or scam/i }))
    const suspendButtons = screen.getAllByRole('button', { name: 'Suspend' })
    fireEvent.click(suspendButtons[suspendButtons.length - 1])

    expect(await screen.findByRole('status')).toHaveTextContent('alice was suspended.')
    expect(screen.getByText('suspended')).toBeInTheDocument()
    expect(screen.getByText(MASKED)).toBeInTheDocument()
    expect(screen.queryByText(FULL)).not.toBeInTheDocument()
    expect(getFullEmail).toHaveBeenCalledTimes(1)
  })

  it('re-masks after opening an order and coming back', async () => {
    getUser.mockResolvedValue(profile({ email: MASKED }))
    listUserOrders.mockResolvedValue(ordersPage([{ order: order(), role: 'requester' }]))
    const emailPromise = Promise.resolve({ email: FULL })
    getFullEmail.mockReturnValueOnce(emailPromise)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Show email for alice' }))
    await act(async () => {
      await emailPromise
    })
    expect(screen.getByText(FULL)).toBeInTheDocument()

    fireEvent.click(screen.getByText('order-aa').closest('tr'))
    fireEvent.click(await screen.findByRole('button', { name: 'Back to user' }))

    expect(await screen.findByText(MASKED)).toBeInTheDocument()
    expect(screen.queryByText(FULL)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show email for alice' })).toBeInTheDocument()
  })
})
