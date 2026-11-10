/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-10
 * Scope: Tests for the admin pages: access, accounts search and paging, the account page's
 *        actions and refusals, login activity and the audit chain check.
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as adminApi from '../api/adminApi'
import { ApiError } from '../api/client'
import { AuthContext, type AuthApi } from '../auth/authContext'
import { clearToken, saveToken } from '../auth/tokenStorage'
import { ToastProvider } from '../components/toast/ToastProvider'
import { tokenFor } from '../errands/testFixtures'
import { AccountPage } from './AccountPage'
import { AccountsPage } from './AccountsPage'
import { AuditLogPage } from './AuditLogPage'
import { LoginActivityPage } from './LoginActivityPage'
import type { AdminAccount, AuditEntry, LoginEvent } from './types'

vi.mock('../api/adminApi')
vi.mock('../api/creditApi', () => ({
  getCreditBalance: vi.fn(async () => ({ available: 100, reserved: 0, total: 100 })),
  listCreditTransactions: vi.fn(),
}))

const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ALICE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const adminAuth: AuthApi = {
  status: 'loggedIn', user: { username: 'root', displayName: 'Root Admin', role: 'ADMINISTRATOR' },
  notice: null, login: vi.fn(), logout: vi.fn(),
}
const memberAuth: AuthApi = { ...adminAuth, user: { username: 'alice_tan', displayName: 'Alice Tan', role: 'MEMBER' } }

function account(overrides: Partial<AdminAccount> = {}): AdminAccount {
  return {
    id: ALICE_ID, username: 'alice_tan', displayName: 'Alice Tan', email: 'alice@u.nus.edu', role: 'MEMBER',
    status: 'ACTIVE', createdAt: '2026-11-01T02:00:00Z', lastLoginAt: '2026-11-09T01:30:00Z', ...overrides,
  }
}
function loginEvent(overrides: Partial<LoginEvent> = {}): LoginEvent {
  return {
    id: '7', occurredAt: '2026-11-10T04:00:00Z', account: { id: ALICE_ID, username: 'alice_tan' }, outcome: 'BLOCKED',
    reason: 'SUSPENDED', ipAddress: '::ffff:172.19.0.10',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', ...overrides,
  }
}
function auditEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: '2', occurredAt: '2026-11-10T03:00:00Z', actor: { type: 'USER', id: ADMIN_ID, username: 'root' },
    action: 'ACCOUNT_SUSPENDED', target: { id: ALICE_ID, username: 'alice_tan' }, previousValue: 'ACTIVE',
    newValue: 'SUSPENDED', reason: 'Password guessing', previousHash: '1111111111aaaa', hash: '2222222222bbbb', ...overrides,
  }
}

function renderAt(path: string, auth: AuthApi = adminAuth) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <AuthContext.Provider value={auth}>
          <Routes>
            <Route path="/admin/accounts" element={<AccountsPage />} />
            <Route path="/admin/accounts/:id" element={<AccountPage />} />
            <Route path="/admin/login-activity" element={<LoginActivityPage />} />
            <Route path="/admin/audit" element={<AuditLogPage />} />
          </Routes>
        </AuthContext.Provider>
      </ToastProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.mocked(adminApi.listAccounts).mockReset().mockResolvedValue({ accounts: [account()], nextCursor: null })
  vi.mocked(adminApi.getAccount).mockReset().mockResolvedValue(account())
  vi.mocked(adminApi.listLoginEvents).mockReset().mockResolvedValue({ events: [loginEvent()], nextCursor: null })
  vi.mocked(adminApi.listAudit).mockReset().mockResolvedValue({ entries: [auditEntry()], nextCursor: null })
  vi.mocked(adminApi.verifyAuditChain).mockReset()
  vi.mocked(adminApi.suspendAccount).mockReset().mockResolvedValue({})
  vi.mocked(adminApi.restoreAccount).mockReset().mockResolvedValue({})
  vi.mocked(adminApi.changeRole).mockReset().mockResolvedValue({})
  saveToken(tokenFor(ADMIN_ID))
})
afterEach(() => clearToken())

describe('access', () => {
  it('members see the administrator notice and no admin data is requested', async () => {
    for (const path of ['/admin/accounts', `/admin/accounts/${ALICE_ID}`, '/admin/login-activity', '/admin/audit']) {
      const { unmount } = renderAt(path, memberAuth)
      expect(screen.getByRole('heading', { name: 'Administrator access required' })).toBeInTheDocument()
      unmount()
    }
    for (const call of [adminApi.listAccounts, adminApi.getAccount, adminApi.listLoginEvents, adminApi.listAudit]) expect(call).not.toHaveBeenCalled()
  })

  it('administrators get the Admin button and the three tabs', async () => {
    renderAt('/admin/accounts')
    expect(within(screen.getByRole('banner')).getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin/accounts')
    const tabs = within(screen.getByRole('navigation', { name: 'Administration' })).getAllByRole('link')
    expect(tabs.map((t) => t.textContent)).toEqual(['Accounts', 'Login activity', 'Audit log'])
    expect(tabs[0]).toHaveAttribute('aria-current', 'page')
  })
})

describe('accounts list', () => {
  it('shows each account with email, status and last login, linking to its page', async () => {
    renderAt('/admin/accounts')
    const link = await screen.findByRole('link', { name: 'Alice Tan' })
    expect(link).toHaveAttribute('href', `/admin/accounts/${ALICE_ID}`)
    const row = link.closest('li')!
    expect(within(row).getByText(/alice@u\.nus\.edu/)).toBeInTheDocument()
    expect(within(row).getByText('Active')).toBeInTheDocument()
    expect(within(row).getByText(/Last login 9 Nov 2026/)).toBeInTheDocument()
  })

  it('searches and filters through the URL, then loads more with the cursor', async () => {
    const user = userEvent.setup()
    vi.mocked(adminApi.listAccounts)
      .mockResolvedValueOnce({ accounts: [account()], nextCursor: null })
      .mockResolvedValueOnce({ accounts: [account()], nextCursor: ALICE_ID })
      .mockResolvedValueOnce({ accounts: [account({ id: ADMIN_ID, username: 'root', displayName: 'Root Admin' })], nextCursor: null })
    renderAt('/admin/accounts')
    await screen.findByRole('link', { name: 'Alice Tan' })
    await user.type(screen.getByLabelText('Search'), '  tan ')
    await user.selectOptions(screen.getByLabelText('Status'), 'SUSPENDED')
    await user.selectOptions(screen.getByLabelText('Role'), 'MEMBER')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => expect(adminApi.listAccounts).toHaveBeenLastCalledWith({ search: 'tan', status: 'SUSPENDED', role: 'MEMBER' }, null, 50, expect.any(AbortSignal)))
    await user.click(await screen.findByRole('button', { name: 'Load more accounts' }))
    expect(await screen.findByRole('link', { name: 'Root Admin' })).toBeInTheDocument()
    expect(adminApi.listAccounts).toHaveBeenLastCalledWith({ search: 'tan', status: 'SUSPENDED', role: 'MEMBER' }, ALICE_ID, 50, undefined)
    expect(screen.getByRole('link', { name: 'Alice Tan' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load more accounts' })).not.toBeInTheDocument()
  })
})

describe('account page', () => {
  it('stacks the details, its login attempts and its audit history, 10 rows each', async () => {
    renderAt(`/admin/accounts/${ALICE_ID}`)
    expect(await screen.findByRole('heading', { name: 'Alice Tan', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('alice@u.nus.edu')).toBeInTheDocument()
    expect(await screen.findByText('Account suspended', { selector: 'span' })).toBeInTheDocument() // login reason
    expect(adminApi.listLoginEvents).toHaveBeenCalledWith({ accountId: ALICE_ID }, null, 10, expect.any(AbortSignal))
    expect(adminApi.listAudit).toHaveBeenCalledWith({ targetId: ALICE_ID }, null, 10, expect.any(AbortSignal))
    expect(await screen.findByText('Reason: Password guessing')).toBeInTheDocument()
  })

  it('suspend needs a reason, then suspends and re-reads the account', async () => {
    const user = userEvent.setup()
    renderAt(`/admin/accounts/${ALICE_ID}`)
    await user.click(await screen.findByRole('button', { name: 'Suspend account' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Suspend @alice_tan?' })
    await user.click(within(dialog).getByRole('button', { name: 'Suspend account' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Please enter a reason.')
    expect(adminApi.suspendAccount).not.toHaveBeenCalled()

    vi.mocked(adminApi.getAccount).mockResolvedValue(account({ status: 'SUSPENDED' }))
    await user.type(within(dialog).getByLabelText('Reason'), ' Password guessing ')
    await user.click(within(dialog).getByRole('button', { name: 'Suspend account' }))
    await waitFor(() => expect(adminApi.suspendAccount).toHaveBeenCalledWith(ALICE_ID, 'Password guessing'))
    expect(await screen.findByRole('button', { name: 'Restore account' })).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(await screen.findByText('@alice_tan was suspended.')).toBeInTheDocument()
    expect(adminApi.getAccount).toHaveBeenCalledTimes(2)
    expect(adminApi.listLoginEvents).toHaveBeenCalledTimes(2)
  })

  it("shows the server's refusal inside the pop-up and keeps it open", async () => {
    const user = userEvent.setup()
    vi.mocked(adminApi.getAccount).mockResolvedValue(account({ role: 'ADMINISTRATOR' }))
    vi.mocked(adminApi.changeRole).mockRejectedValue(new ApiError(409, 'LAST_ADMINISTRATOR', 'This change would leave no active administrator'))
    renderAt(`/admin/accounts/${ALICE_ID}`)
    await user.click(await screen.findByRole('button', { name: 'Make member' }))
    const dialog = screen.getByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Make member' }))
    await waitFor(() => expect(adminApi.changeRole).toHaveBeenCalledWith(ALICE_ID, 'MEMBER', ''))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('This change would leave no active administrator')
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('restores a suspended account', async () => {
    const user = userEvent.setup()
    vi.mocked(adminApi.getAccount).mockResolvedValue(account({ status: 'SUSPENDED' }))
    renderAt(`/admin/accounts/${ALICE_ID}`)
    await user.click(await screen.findByRole('button', { name: 'Restore account' }))
    await user.type(screen.getByLabelText('Reason'), 'Appeal accepted')
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Restore account' }))
    await waitFor(() => expect(adminApi.restoreAccount).toHaveBeenCalledWith(ALICE_ID, 'Appeal accepted'))
  })

  it('hides suspend and role buttons on your own account', async () => {
    vi.mocked(adminApi.getAccount).mockResolvedValue(account({ id: ADMIN_ID, username: 'root', displayName: 'Root Admin', role: 'ADMINISTRATOR' }))
    renderAt(`/admin/accounts/${ADMIN_ID}`)
    expect(await screen.findByText(/This is your own account/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Suspend account' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Make member' })).not.toBeInTheDocument()
  })

  it('explains an unknown account', async () => {
    vi.mocked(adminApi.getAccount).mockRejectedValue(new ApiError(404, 'USER_NOT_FOUND', 'No such user'))
    renderAt('/admin/accounts/nope')
    expect(await screen.findByRole('heading', { name: 'Couldn’t load this account' })).toBeInTheDocument()
    expect(screen.getByText('No such user')).toBeInTheDocument()
  })
})

describe('login activity', () => {
  it('lists attempts with the browser summary, no IP, and unknown usernames', async () => {
    vi.mocked(adminApi.listLoginEvents).mockResolvedValue({
      events: [loginEvent(), loginEvent({ id: '6', account: null, outcome: 'FAILED', reason: 'NO_SUCH_ACCOUNT', userAgent: 'curl/8.5.0' })],
      nextCursor: null,
    })
    renderAt('/admin/login-activity')
    const chrome = await screen.findByText('Chrome on Linux')
    expect(chrome).toHaveAttribute('title', expect.stringContaining('Chrome/131.0.0.0'))
    expect(screen.getByText('Unknown username')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '@alice_tan' })).toHaveAttribute('href', `/admin/accounts/${ALICE_ID}`)
    expect(screen.queryByText(/172\.19\.0\.10/)).not.toBeInTheDocument()
    expect(screen.getAllByText(/10 Nov 2026.*12:00:00/)).toHaveLength(2)
  })

  it('filters by outcome and reason', async () => {
    const user = userEvent.setup()
    renderAt('/admin/login-activity')
    await screen.findByText('Chrome on Linux')
    await user.selectOptions(screen.getByLabelText('Outcome'), 'FAILED')
    await waitFor(() => expect(adminApi.listLoginEvents).toHaveBeenLastCalledWith({ outcome: 'FAILED', reason: undefined }, null, 50, expect.any(AbortSignal)))
    await user.selectOptions(screen.getByLabelText('Reason'), 'WRONG_PASSWORD')
    await waitFor(() => expect(adminApi.listLoginEvents).toHaveBeenLastCalledWith({ outcome: 'FAILED', reason: 'WRONG_PASSWORD' }, null, 50, expect.any(AbortSignal)))
  })
})

describe('audit log', () => {
  it('shows shortened hashes and links, and verifies only when the button is pressed', async () => {
    const user = userEvent.setup()
    vi.mocked(adminApi.verifyAuditChain).mockResolvedValue({ valid: true, checkedEntries: 2, firstInvalidId: null, latestHash: '2222222222bbbb' })
    renderAt('/admin/audit')
    expect(await screen.findByText('2222222222…')).toBeInTheDocument()
    expect(screen.getByText('1111111111…')).toBeInTheDocument()
    expect(adminApi.verifyAuditChain).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Verify chain' }))
    expect(await screen.findByText(/Chain valid: 2 entries checked/)).toBeInTheDocument()
  })

  it('reports a broken chain', async () => {
    const user = userEvent.setup()
    vi.mocked(adminApi.verifyAuditChain).mockResolvedValue({ valid: false, checkedEntries: 5, firstInvalidId: '3', latestHash: 'x' })
    renderAt('/admin/audit')
    await user.click(await screen.findByRole('button', { name: 'Verify chain' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Chain broken at entry #3')
  })
})
