/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: Tests for the Stage 20b email eye icon (per instructions.md Stage 20b's Tests
 *        section): icon visibility, unmask/re-mask on click, the 60s auto-re-mask timer
 *        (Vitest fake timers, two rows unmasked independently), the failure toast, and
 *        re-masking on a table refetch. listUsers and getFullEmail are mocked.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-05
 * Scope: Stage 24 of instructions.md - renderPage now wraps in MemoryRouter (AdminUsers.jsx
 *        calls useNavigate unconditionally as of this stage, which throws outside a Router),
 *        plus a dummy /admin/user-transactions/:userId route to check the new row-click entry
 *        point: a row click navigates there, and the three-dot menu still opens without
 *        navigating. Mocked useBalance (api/lookups) for the new Credits column, and added a
 *        test for it, per the stage's "Summary fields" row for this table.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: Stage 26e of instructions.md - revealing an email now opens a reason dialog before
 *        getFullEmail is called; every eye-icon test that reveals now selects a reason and
 *        clicks the dialog's Confirm ("Reveal") button first, and asserts getFullEmail is
 *        called with that reason. Re-masking (already-unmasked click, or the 60s timer) still
 *        sends no request and needed no test change.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: Per author direction in chat (instructions.md Stage 26 "Reasons" amendment):
 *        startReveal no longer drives a reason dialog (unmask calls getFullEmail directly on
 *        the eye click), and its one request-shape assertion now expects no reason argument.
 *        Added a test that Unlock's dialog has no reason picker and confirms with no payload.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-08, Codex, model: GPT-6): Updated dropdown interaction tests.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 27c of instructions.md - every existing test here now runs with a valid
 *        elevation fixture (set in beforeEach) so the row-action/reason-dialog behaviour they
 *        check is unaffected by the new gate, per the stage's "existing status and role tests
 *        need an elevation fixture" instruction. Added a new "AdminUsers elevation (Stage 27c)"
 *        describe block covering the gate itself: the Elevate button/timer, not-elevated
 *        opening the OTP modal before the reason dialog, elevated opening it straight away, the
 *        timer disappearing and the button re-enabling at zero, and the mid-submit
 *        ELEVATION_REQUIRED retry keeping the entered reason. api/admin is mocked for the OTP
 *        modal's own calls (its wrong-code/cooldown/etc. behaviour has its own test file).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/Toast'
import AdminUsers from '../../src/pages/AdminUsers'
import { getFullEmail, listUsers, unlockUser, updateUserStatus } from '../../src/api/users'
import { useBalance } from '../../src/api/lookups'
import * as adminApi from '../../src/api/admin'
import { clearElevationToken, setElevationToken } from '../../src/utils/elevation'

vi.mock('../../src/api/users', () => ({
  listUsers: vi.fn(),
  getFullEmail: vi.fn(),
  unlockUser: vi.fn(),
  updateUserRole: vi.fn(),
  updateUserStatus: vi.fn(),
}))

vi.mock('../../src/api/lookups', () => ({
  useBalance: vi.fn(),
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

const VIEWER = { id: 'admin-1', username: 'admin', role: 'admin' }

vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: VIEWER,
    isLoggedIn: true,
    sessionReady: true,
    requireAuth: vi.fn(),
  }),
}))

function userRow(overrides) {
  return {
    id: 'user-1',
    username: 'alice',
    email: 'a***@example.com',
    status: 'active',
    role: 'user',
    activeView: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    isLocked: false,
    lockedUntil: null,
    lockLevel: 0,
    ...overrides,
  }
}

const ALICE = userRow({ id: 'user-1', username: 'alice', email: 'a***@example.com' })
const BOB = userRow({ id: 'user-2', username: 'bob', email: 'b***@example.com' })
const SELF_ROW = userRow({ id: VIEWER.id, username: 'admin', email: 'a***@example.com', role: 'admin' })
const SUPER_ADMIN_ROW = userRow({
  id: 'sa-1',
  username: 'root',
  email: 'r***@example.com',
  role: 'super admin',
})

function usersPage(users) {
  return { users, page: 1, pageSize: 50, total: users.length, totalPages: 1 }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/users']}>
      <ToastProvider>
        <Routes>
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route
            path="/admin/user-transactions/:userId"
            element={<p>User history page</p>}
          />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useBalance.mockReturnValue(null)
  // Existing tests below predate Stage 27b/27c's elevation gate; they ran (and still assert the
  // same behaviour) while already elevated. The gate itself is covered by its own describe
  // block, which clears this.
  setElevationToken(fakeToken())
})

afterEach(() => {
  vi.useRealTimers()
  clearElevationToken()
})

// An eye click on a masked row calls getFullEmail directly - no reason dialog (instructions.md
// Stage 26 "Reasons" amendment).
function startReveal(username) {
  fireEvent.click(screen.getByRole('button', { name: 'Show email for ' + username }))
}

describe('AdminUsers email eye icon (Stage 20b)', () => {
  it('shows the eye icon only on other users\' rows, not on the caller\'s own row or a super admin row', async () => {
    listUsers.mockResolvedValue(usersPage([ALICE, SELF_ROW, SUPER_ADMIN_ROW]))
    renderPage()

    expect(await screen.findByText('alice')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show email for alice' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /email for admin/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /email for root/i })).not.toBeInTheDocument()
  })

  it('reveals the full email on click and re-masks on a second click with no further request', async () => {
    listUsers.mockResolvedValue(usersPage([ALICE]))
    const emailPromise = Promise.resolve({ email: 'alice@example.com' })
    getFullEmail.mockReturnValueOnce(emailPromise)
    renderPage()

    await screen.findByRole('button', { name: 'Show email for alice' })
    startReveal('alice')
    await act(async () => {
      await emailPromise
    })

    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
    expect(getFullEmail).toHaveBeenCalledWith('user-1')
    expect(getFullEmail).toHaveBeenCalledTimes(1)

    const hideButton = screen.getByRole('button', { name: 'Hide email for alice' })
    fireEvent.click(hideButton)

    expect(screen.getByText('a***@example.com')).toBeInTheDocument()
    expect(getFullEmail).toHaveBeenCalledTimes(1)
  })

  it('auto re-masks 60 seconds after unmasking', async () => {
    listUsers.mockResolvedValue(usersPage([ALICE]))
    const emailPromise = Promise.resolve({ email: 'alice@example.com' })
    getFullEmail.mockReturnValueOnce(emailPromise)
    renderPage()

    await screen.findByRole('button', { name: 'Show email for alice' })

    vi.useFakeTimers()
    startReveal('alice')
    await act(async () => {
      await emailPromise
    })
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(59_999)
    })
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getByText('a***@example.com')).toBeInTheDocument()
  })

  it('re-masks two unmasked rows independently, each on its own 60s timer', async () => {
    listUsers.mockResolvedValue(usersPage([ALICE, BOB]))
    const aliceEmail = Promise.resolve({ email: 'alice@example.com' })
    const bobEmail = Promise.resolve({ email: 'bob@example.com' })
    getFullEmail.mockImplementation((id) => (id === 'user-1' ? aliceEmail : bobEmail))
    renderPage()

    await screen.findByRole('button', { name: 'Show email for alice' })

    vi.useFakeTimers()
    startReveal('alice')
    await act(async () => {
      await aliceEmail
    })
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(30_000)
    })

    startReveal('bob')
    await act(async () => {
      await bobEmail
    })
    expect(screen.getByText('bob@example.com')).toBeInTheDocument()

    // 30s + 30s = 60s elapsed for alice; bob has only had 30s.
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(screen.getByText('a***@example.com')).toBeInTheDocument()
    expect(screen.getByText('bob@example.com')).toBeInTheDocument()

    // Bob now reaches 60s.
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(screen.getByText('b***@example.com')).toBeInTheDocument()
  })

  it('shows a failure toast and leaves the row masked when getFullEmail fails', async () => {
    listUsers.mockResolvedValue(usersPage([ALICE]))
    getFullEmail.mockRejectedValueOnce({ code: 'USER_NOT_FOUND' })
    renderPage()

    await screen.findByRole('button', { name: 'Show email for alice' })
    startReveal('alice')

    expect(await screen.findByRole('status')).toHaveTextContent('That user could not be found.')
    expect(screen.getByText('a***@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show email for alice' })).toBeInTheDocument()
  })

  it('re-masks every row after the table refetches (e.g. a filter change)', async () => {
    // A fresh object per call, like a real response, so the refetch is a genuinely new `data`
    // reference (mockResolvedValue would reuse one object's identity across calls, hiding the
    // effect this test is checking).
    listUsers.mockImplementation(() => Promise.resolve(usersPage([ALICE])))
    const emailPromise = Promise.resolve({ email: 'alice@example.com' })
    getFullEmail.mockReturnValueOnce(emailPromise)
    renderPage()

    await screen.findByRole('button', { name: 'Show email for alice' })
    startReveal('alice')
    await act(async () => {
      await emailPromise
    })
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()

    fireEvent.focus(screen.getByLabelText('Filter by status'))
    fireEvent.click(screen.getByRole('option', { name: /Active/i }))

    await waitFor(() => {
      expect(screen.getByText('a***@example.com')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Show email for alice' })).toBeInTheDocument()
  })
})

describe('AdminUsers row click (Stage 24 entry point)', () => {
  it('clicking a row opens that user\'s history page', async () => {
    listUsers.mockResolvedValue(usersPage([ALICE]))
    renderPage()

    const row = (await screen.findByText('alice')).closest('tr')
    fireEvent.click(row)

    expect(await screen.findByText('User history page')).toBeInTheDocument()
  })

  it('the three-dot menu still opens on click, without navigating', async () => {
    listUsers.mockResolvedValue(usersPage([ALICE]))
    renderPage()

    await screen.findByText('alice')
    fireEvent.click(screen.getByRole('button', { name: 'Actions for alice' }))

    expect(await screen.findByRole('menuitem', { name: 'Suspend' })).toBeInTheDocument()
    expect(screen.queryByText('User history page')).not.toBeInTheDocument()
  })
})

describe('AdminUsers reason dialog (Stage 26e)', () => {
  function openSuspendDialog() {
    fireEvent.click(screen.getByRole('button', { name: 'Actions for alice' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Suspend' }))
  }

  it('shows only the Suspend action\'s preset codes, and Confirm is disabled until one is chosen', async () => {
    listUsers.mockResolvedValue(usersPage([ALICE]))
    renderPage()
    await screen.findByText('alice')

    openSuspendDialog()
    const select = screen.getByLabelText('Reason')
    fireEvent.focus(select)
    expect(screen.getByRole('option', { name: /Fraud or scam/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Other' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Suspend' })).toBeDisabled()

    fireEvent.focus(select)
    fireEvent.click(screen.getByRole('option', { name: /Fraud or scam/i }))
    expect(screen.getByRole('button', { name: 'Suspend' })).toBeEnabled()
  })

  it('OTHER shows a details box with a live count; Confirm stays disabled until 10-500 characters', async () => {
    listUsers.mockResolvedValue(usersPage([ALICE]))
    renderPage()
    await screen.findByText('alice')

    openSuspendDialog()
    fireEvent.focus(screen.getByLabelText('Reason'))
    fireEvent.click(screen.getByRole('option', { name: 'Other' }))
    const confirmButton = screen.getByRole('button', { name: 'Suspend' })
    expect(confirmButton).toBeDisabled()

    const details = screen.getByLabelText('Details')
    fireEvent.change(details, { target: { value: 'too short' } })
    expect(screen.getByText('9/500')).toBeInTheDocument()
    expect(screen.getByText('Details must be between 10 and 500 characters')).toBeInTheDocument()
    expect(confirmButton).toBeDisabled()

    fireEvent.change(details, { target: { value: 'exactly 10' } })
    expect(screen.getByText('10/500')).toBeInTheDocument()
    expect(screen.queryByText('Details must be between 10 and 500 characters')).not.toBeInTheDocument()
    expect(confirmButton).toBeEnabled()
  })

  it('sends { reason } for a preset code, and { reason: "OTHER", otherReason } for OTHER', async () => {
    listUsers.mockResolvedValue(usersPage([ALICE]))
    // Resolves to the unchanged row both times, so the menu still offers "Suspend" on the
    // second open (this test only checks the request bodies, not the resulting row state).
    updateUserStatus.mockResolvedValue(ALICE)
    renderPage()
    await screen.findByText('alice')

    openSuspendDialog()
    fireEvent.focus(screen.getByLabelText('Reason'))
    fireEvent.click(screen.getByRole('option', { name: /Fraud or scam/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }))

    await waitFor(() =>
      expect(updateUserStatus).toHaveBeenCalledWith('user-1', 'suspended', { reason: 'FRAUD_OR_SCAM' }),
    )

    updateUserStatus.mockClear()
    openSuspendDialog()
    fireEvent.focus(screen.getByLabelText('Reason'))
    fireEvent.click(screen.getByRole('option', { name: 'Other' }))
    fireEvent.change(screen.getByLabelText('Details'), { target: { value: '  a good long reason here  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }))

    await waitFor(() =>
      expect(updateUserStatus).toHaveBeenCalledWith('user-1', 'suspended', {
        reason: 'OTHER',
        otherReason: 'a good long reason here',
      }),
    )
  })

  it('Unlock has no reason picker and confirms with no payload', async () => {
    const locked = userRow({ id: 'user-1', username: 'alice', email: 'a***@example.com', isLocked: true })
    listUsers.mockResolvedValue(usersPage([locked]))
    unlockUser.mockResolvedValue({ ...locked, isLocked: false })
    renderPage()
    await screen.findByText('alice')

    fireEvent.click(screen.getByRole('button', { name: 'Actions for alice' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Unlock' }))
    expect(screen.queryByLabelText('Reason')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    await waitFor(() => expect(unlockUser).toHaveBeenCalledWith('user-1'))
  })

  it('cancelling the dialog sends no request', async () => {
    listUsers.mockResolvedValue(usersPage([ALICE]))
    renderPage()
    await screen.findByText('alice')

    openSuspendDialog()
    fireEvent.focus(screen.getByLabelText('Reason'))
    fireEvent.click(screen.getByRole('option', { name: /Fraud or scam/i }))
    // Two elements share the "Cancel" accessible name: the dialog's own Cancel button and the
    // backdrop button (also labelled "Cancel" for screen readers). Either closes the dialog;
    // this clicks the visible button, which is listed last.
    const cancelButtons = screen.getAllByRole('button', { name: 'Cancel' })
    fireEvent.click(cancelButtons[cancelButtons.length - 1])

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(updateUserStatus).not.toHaveBeenCalled()
  })

  it('a no-op action still collects a reason and sends it, returning 200 unchanged', async () => {
    const suspendedAlice = userRow({ id: 'user-1', username: 'alice', email: 'a***@example.com', status: 'suspended' })
    listUsers.mockResolvedValue(usersPage([suspendedAlice]))
    updateUserStatus.mockResolvedValue(suspendedAlice) // already active -> unsuspend is a no-op
    renderPage()
    await screen.findByText('alice')

    fireEvent.click(screen.getByRole('button', { name: 'Actions for alice' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Unsuspend' }))
    fireEvent.focus(screen.getByLabelText('Reason'))
    fireEvent.click(screen.getByRole('option', { name: /Issue resolved/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Unsuspend' }))

    await waitFor(() =>
      expect(updateUserStatus).toHaveBeenCalledWith('user-1', 'active', { reason: 'ISSUE_RESOLVED' }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('alice was unsuspended.')
  })
})

describe('AdminUsers Credits column (Stage 24 Summary fields)', () => {
  it('shows the balance when it resolves', async () => {
    listUsers.mockResolvedValue(usersPage([ALICE]))
    useBalance.mockReturnValue({
      userId: 'user-1',
      totalBalance: 42,
      reservedBalance: 2,
      unreservedBalance: 40,
    })
    renderPage()

    expect(await screen.findByText('42')).toBeInTheDocument()
  })

  it('shows a dash while the balance has not resolved', async () => {
    listUsers.mockResolvedValue(usersPage([ALICE]))
    useBalance.mockReturnValue(null)
    renderPage()

    await screen.findByText('alice')
    // Both the Credits and Locked columns fall back to "—" for this row.
    expect(screen.getAllByText('—')).toHaveLength(2)
  })
})

describe('AdminUsers elevation (Stage 27c)', () => {
  function openSuspendMenu() {
    fireEvent.click(screen.getByRole('button', { name: 'Actions for alice' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Suspend' }))
  }

  it('shows the timer while elevated, and the button is disabled only then', async () => {
    listUsers.mockResolvedValue(usersPage([ALICE]))
    renderPage()
    await screen.findByText('alice')

    expect(screen.getByText(/Unlocked for 1[45]:\d\d/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Elevate privileges' })).toBeDisabled()
  })

  it('shows no timer and an enabled button when not elevated', async () => {
    clearElevationToken()
    listUsers.mockResolvedValue(usersPage([ALICE]))
    renderPage()
    await screen.findByText('alice')

    expect(screen.queryByText(/Unlocked for/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Elevate privileges' })).toBeEnabled()
  })

  it('clicking "Elevate privileges" opens the OTP modal; verifying runs no action', async () => {
    clearElevationToken()
    listUsers.mockResolvedValue(usersPage([ALICE]))
    adminApi.sendAdminOtp.mockResolvedValue({ message: 'sent', code: 'OTP_SENT' })
    adminApi.verifyAdminOtp.mockResolvedValue({ elevationToken: fakeToken() })
    renderPage()
    await screen.findByText('alice')

    fireEvent.click(screen.getByRole('button', { name: 'Elevate privileges' }))
    expect(screen.getByRole('dialog', { name: 'Verify your identity' })).toBeInTheDocument()

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send code' })))
    await act(async () => {
      screen.getAllByRole('textbox').forEach((input, i) => fireEvent.change(input, { target: { value: String(i) } }))
    })

    expect(screen.queryByRole('dialog', { name: 'Verify your identity' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(updateUserStatus).not.toHaveBeenCalled()
  })

  it('clicking an action while not elevated opens the OTP modal before the reason dialog', async () => {
    clearElevationToken()
    listUsers.mockResolvedValue(usersPage([ALICE]))
    adminApi.sendAdminOtp.mockResolvedValue({ message: 'sent', code: 'OTP_SENT' })
    adminApi.verifyAdminOtp.mockResolvedValue({ elevationToken: fakeToken() })
    renderPage()
    await screen.findByText('alice')

    openSuspendMenu()
    expect(screen.getByRole('dialog', { name: 'Verify your identity' })).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send code' })))
    await act(async () => {
      screen.getAllByRole('textbox').forEach((input, i) => fireEvent.change(input, { target: { value: String(i) } }))
    })

    expect(screen.queryByRole('dialog', { name: 'Verify your identity' })).not.toBeInTheDocument()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('clicking an action while elevated opens the reason dialog straight away', async () => {
    listUsers.mockResolvedValue(usersPage([ALICE]))
    renderPage()
    await screen.findByText('alice')

    openSuspendMenu()

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Verify your identity' })).not.toBeInTheDocument()
  })

  it('a mid-submit ELEVATION_REQUIRED keeps the entered reason and retries after verifying', async () => {
    listUsers.mockResolvedValue(usersPage([ALICE]))
    // api/users.js is mocked wholesale here, so it cannot clear the stored token itself (that
    // behaviour has its own test in tests/api/users.test.js); simulate its side effect so
    // useElevatedActionFlow sees "not elevated" and opens the modal instead of re-running
    // immediately.
    updateUserStatus.mockImplementationOnce(() => {
      clearElevationToken()
      return Promise.reject({ code: 'ELEVATION_REQUIRED' })
    })
    updateUserStatus.mockResolvedValueOnce({ ...ALICE, status: 'suspended' })
    adminApi.sendAdminOtp.mockResolvedValue({ message: 'sent', code: 'OTP_SENT' })
    adminApi.verifyAdminOtp.mockResolvedValue({ elevationToken: fakeToken() })
    renderPage()
    await screen.findByText('alice')

    openSuspendMenu()
    fireEvent.focus(screen.getByLabelText('Reason'))
    fireEvent.click(screen.getByRole('option', { name: /Fraud or scam/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }))

    // The reason dialog stays open (its entered reason preserved) while the OTP modal opens.
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
