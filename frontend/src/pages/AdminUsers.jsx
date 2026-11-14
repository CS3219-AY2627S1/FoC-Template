/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-23
 * Scope: Created the admin user-management page, per instructions.md Stage 16g: a searchable,
 *        filterable, sortable, paginated user table with per-row suspend/unsuspend and
 *        promote/demote actions, gated to exactly what user-service's PUT /users/:id/status
 *        and PUT /users/:id/role would allow (mirrored from users.service.ts's changeUserStatus
 *        and changeUserRole). Reached via the "Manage users" nav link added to TopNav.jsx in
 *        Stage 16b.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: Added the Locked column, the `locked` filter and a per-row Unlock action calling
 *        POST /users/:id/unlock, per instructions.md Stage 18e. Unlock's visibility follows
 *        the same rule as Suspend in getRowActions, per the governing decision.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: Added the per-row email eye icon (Stage 20b): click calls getFullEmail to reveal the
 *        real email, click again or a 60s timer re-masks it with no request, and any refetch
 *        (filter/sort/page change or a row action) clears every row's unmask state and timers.
 *        No eye icon on the caller's own row or a super admin's row, per the stage's rule.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: Replaced RowMenu's inline absolutely-positioned dropdown with the new ActionMenu
 *        component (Stage 21a), so the open menu is no longer clipped by the table wrapper's
 *        `overflow-x: auto`. Row action set, handlers and visibility rules unchanged.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-05
 * Scope: Stage 24 of instructions.md - exported getRowActions, ACTION_SUCCESS, ACTION_DIALOG
 *        and ConfirmActionDialog so the new admin user-history page can reuse the exact same
 *        allowed-actions table and confirmation dialog, rather than a second copy that could
 *        drift from this one. Row clicks now navigate to that page (/admin/user-transactions/
 *        :userId); the three-dot menu's cell stops the click from bubbling to the row so it
 *        keeps opening the menu instead of navigating. Added the Credits column (useBalance),
 *        per the stage's "Summary fields" row for this table.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: Stage 26e of instructions.md - ConfirmActionDialog (shared with
 *        AdminUserTransactions.jsx) now also collects a reason: a dropdown of that action's
 *        preset codes, plus a 10-500 character details box when OTHER is selected. Confirm is
 *        disabled until valid, and onConfirm is now called with the reason payload. The email
 *        eye icon now opens the same dialog (with the unmask presets) before calling the
 *        now-POST getFullEmail; re-masking (second click, or the 60s timer) is unchanged and
 *        asks nothing. Added the unlock preset-match check to getRowActions's caller contract
 *        only implicitly - no visibility rule changed, only the action handlers' signatures.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: Per author direction in chat (instructions.md Stage 26 "Reasons" amendment): Unlock
 *        keeps its plain confirmation dialog but ConfirmActionDialog now skips the reason
 *        picker for any action with no preset codes, calling onConfirm() with no payload.
 *        Unmask no longer shows a dialog at all - the eye click calls getFullEmail directly.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-08, Codex, model: GPT-6): Replaced native dropdowns with the requested searchable control.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 27c of instructions.md - added the "Elevate privileges" button and ElevateTimer
 *        next to it (new component, this page only), and gated every row action behind
 *        useElevatedActionFlow (utils/elevation.js): not elevated opens ElevationOtpModal
 *        first, elevated opens ConfirmActionDialog straight away, same as before. runAction's
 *        catch gained an ELEVATION_REQUIRED branch that keeps the open ConfirmActionDialog (and
 *        its entered reason) and retries the same call once the OTP modal reports success,
 *        per the stage's "reason already entered is kept" rule.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-fable-5-1), date: 2026-11-10
 * Scope: Stage 30 of instructions.md - moved the inline email eye-icon logic (canUnmaskEmail,
 *        the per-row unmasked state, 60 s timers, remask/remaskAll, toggleUnmask) into the
 *        shared utils/emailUnmask.js hook and components/EmailUnmaskButton.jsx so the admin
 *        user page can reuse it. Behaviour on this page is unchanged: a refetch still re-masks
 *        every row, and the existing Stage 20b tests pass unmodified.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import SearchableSelect from '../components/SearchableSelect'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronUp, MoreVertical } from 'lucide-react'
import ActionMenu from '../components/ActionMenu'
import Button from '../components/Button'
import ElevateTimer from '../components/ElevateTimer'
import ElevationOtpModal from '../components/ElevationOtpModal'
import EmailUnmaskButton from '../components/EmailUnmaskButton'
import FieldError from '../components/FieldError'
import { useBalance } from '../api/lookups'
import EmptyState from '../components/EmptyState'
import { Pager, useApiNotice } from '../components/ApiNotice'
import { useToast } from '../components/Toast'
import { useAuth } from '../context/AuthContext'
import { useApi } from '../api/useApi'
import { listUsers, unlockUser, updateUserRole, updateUserStatus } from '../api/users'
import { describeError } from '../api/errorMessages'
import { ACTION_TO_AUDIT_ACTION, AUDIT_REASON_CODES } from '../constants/auditReasons'
import { useElevatedActionFlow } from '../utils/elevation'
import { canUnmaskEmail, useEmailUnmask } from '../utils/emailUnmask'

const inputClass =
  'h-11 w-full rounded-btn border border-line bg-surface px-3 text-base text-ink md:h-10 md:text-sm'
const selectClass =
  'h-11 w-full rounded-btn border border-line bg-surface px-3 text-sm text-ink md:h-10'

const STATUS_LABELS = { pending: 'Pending', active: 'Active', suspended: 'Suspended' }
const STATUS_TONES = {
  pending: 'border-line text-ink-40',
  active: 'border-blue text-blue',
  suspended: 'border-alert text-alert',
}
const ROLE_LABELS = { user: 'User', admin: 'Admin', 'super admin': 'Super admin' }
const ROLE_TONES = {
  user: 'border-line text-ink-70',
  admin: 'border-blue text-blue',
  'super admin': 'border-orange text-orange',
}

function Badge({ tone, children, ...rest }) {
  return (
    <span
      className={
        'inline-flex h-5 items-center rounded-pill border bg-surface px-2 text-[11px] font-medium ' +
        tone
      }
      {...rest}
    >
      {children}
    </span>
  )
}

// A dash while loading or for a user with no wallet yet (e.g. still pending) - same fallback
// style as the Locked column below.
function CreditsCell({ userId }) {
  const balance = useBalance(userId)
  return <span className="tnum">{balance ? balance.totalBalance : '—'}</span>
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// Mirrors user-service's changeUserStatus/changeUserRole/unlockUser (src/services/users.service.ts)
// exactly, so the menu never offers an action the backend would reject. Returns the action each
// control performs, or null to hide it; both null means "no menu" for that row. Unlock follows
// the same visibility rule as suspend (Stage 18d/18e's governing decision).
export function getRowActions(viewer, row) {
  if (row.id === viewer.id) return { suspend: null, role: null, unlock: null }
  if (row.role === 'super admin') return { suspend: null, role: null, unlock: null }
  if (row.status === 'pending') return { suspend: null, role: null, unlock: null }

  const viewerIsSuperAdmin = viewer.role === 'super admin'
  const canActOnLock = viewerIsSuperAdmin || row.role === 'user'

  let suspend = null
  if (canActOnLock) {
    suspend = row.status === 'suspended' ? 'unsuspend' : 'suspend'
  }

  let role = null
  if (viewerIsSuperAdmin && row.status === 'active') {
    role = row.role === 'user' ? 'promote' : 'demote'
  }

  const unlock = canActOnLock && row.isLocked ? 'unlock' : null

  return { suspend, role, unlock }
}

export const ACTION_SUCCESS = {
  suspend: (name) => name + ' was suspended.',
  unsuspend: (name) => name + ' was unsuspended.',
  promote: (name) => name + ' was promoted to admin.',
  demote: (name) => name + ' was demoted to user.',
  unlock: (name) => name + ' was unlocked.',
}

export const ACTION_DIALOG = {
  suspend: {
    title: (name) => 'Suspend ' + name + '?',
    body: 'They will be signed out everywhere and unable to log back in until unsuspended.',
    confirmLabel: 'Suspend',
    variant: 'danger',
  },
  unsuspend: {
    title: (name) => 'Unsuspend ' + name + '?',
    body: 'They will be able to log in again.',
    confirmLabel: 'Unsuspend',
    variant: 'primary',
  },
  promote: {
    title: (name) => 'Promote ' + name + ' to admin?',
    body: 'They will be signed out everywhere and gain admin access on their next login.',
    confirmLabel: 'Promote',
    variant: 'primary',
  },
  demote: {
    title: (name) => 'Demote ' + name + ' to user?',
    body: 'They will be signed out everywhere and lose admin access on their next login.',
    confirmLabel: 'Demote',
    variant: 'danger',
  },
  unlock: {
    title: (name) => 'Unlock ' + name + '?',
    body: 'They will be able to log in and change their email/password again immediately.',
    confirmLabel: 'Unlock',
    variant: 'primary',
  },
}

const MIN_OTHER_REASON = 10
const MAX_OTHER_REASON = 500

// Combines the existing confirmation (title/body naming the user and action) with a reason
// picker, per instructions.md Stage 26e: a dropdown of that action's preset codes, and, when
// OTHER is selected, a 10-500 character details box with a live count. Confirm stays disabled
// until a code is chosen and (for OTHER) the details are valid. onConfirm is called with the
// reason payload: { reason } or { reason: 'OTHER', otherReason }.
// Per the Stage 26 "Reasons" amendment, an action with no preset codes (unlock) skips the
// reason picker entirely and Confirm calls onConfirm() with no payload.
export function ConfirmActionDialog({ user, action, busy, onCancel, onConfirm }) {
  const spec = ACTION_DIALOG[action]
  const codes = AUDIT_REASON_CODES[ACTION_TO_AUDIT_ACTION[action]]
  const needsReason = codes.length > 0
  const [reason, setReason] = useState('')
  const [otherReason, setOtherReason] = useState('')

  const trimmedOther = otherReason.trim()
  const otherValid = trimmedOther.length >= MIN_OTHER_REASON && trimmedOther.length <= MAX_OTHER_REASON
  const valid = !needsReason || (reason !== '' && (reason !== 'OTHER' || otherValid))

  function handleConfirm() {
    if (!valid || busy) return
    if (!needsReason) {
      onConfirm()
      return
    }
    onConfirm(reason === 'OTHER' ? { reason: 'OTHER', otherReason: trimmedOther } : { reason })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Cancel"
        className="absolute inset-0 bg-black/40"
        onClick={onCancel}
      />
      <div
        role="alertdialog"
        aria-labelledby="confirm-action-title"
        className="foc-fade relative w-full max-w-md rounded-t-card bg-surface p-5 shadow-modal sm:rounded-card"
      >
        <h2 id="confirm-action-title" className="text-lg font-semibold text-ink">
          {spec.title(user.username)}
        </h2>
        <p className="mt-2 text-sm text-ink-70">{spec.body}</p>

        {needsReason && (
          <div className="mt-4">
            <label htmlFor="confirm-action-reason" className="mb-1 block text-sm font-medium text-ink">
              Reason
            </label>
            <SearchableSelect
              id="confirm-action-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={selectClass}
            >
              <option value="">Select a reason…</option>
              {codes.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </SearchableSelect>
            {reason === 'OTHER' && (
              <div className="mt-3">
                <label htmlFor="confirm-action-other-reason" className="mb-1 block text-sm font-medium text-ink">
                  Details
                </label>
                <textarea
                  id="confirm-action-other-reason"
                  value={otherReason}
                  onChange={(e) => setOtherReason(e.target.value)}
                  rows={3}
                  className={inputClass + ' h-auto resize-none'}
                />
                <div className="mt-1 text-right text-xs text-ink-40">
                  {trimmedOther.length}/{MAX_OTHER_REASON}
                </div>
                {trimmedOther.length > 0 && !otherValid && (
                  <FieldError message={`Details must be between ${MIN_OTHER_REASON} and ${MAX_OTHER_REASON} characters`} />
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={spec.variant} onClick={handleConfirm} disabled={busy || !valid}>
            {busy ? 'Working…' : spec.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

// Three-dot menu: visible on row hover (desktop), always visible below the `sm` breakpoint
// (touch / small screens have no hover). Rendered via ActionMenu (Stage 21a) so the open menu
// portals out of the table wrapper's `overflow-x: auto` instead of being clipped by it.
function RowMenu({ user, viewer, onPick }) {
  const actions = getRowActions(viewer, user)
  const items = []
  if (actions.suspend === 'suspend') items.push({ label: 'Suspend', onSelect: () => onPick('suspend') })
  if (actions.suspend === 'unsuspend')
    items.push({ label: 'Unsuspend', onSelect: () => onPick('unsuspend') })
  if (actions.role === 'promote')
    items.push({ label: 'Promote to admin', onSelect: () => onPick('promote') })
  if (actions.role === 'demote') items.push({ label: 'Demote to user', onSelect: () => onPick('demote') })
  if (actions.unlock === 'unlock') items.push({ label: 'Unlock', onSelect: () => onPick('unlock') })

  return (
    <ActionMenu
      ariaLabel={'Actions for ' + user.username}
      trigger={<MoreVertical size={16} aria-hidden="true" />}
      triggerClassName="flex h-9 w-9 items-center justify-center rounded-btn text-ink-70 hover:bg-surface-alt hover:text-ink sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
      items={items}
    />
  )
}

const SORTABLE = { username: 'Username', email: 'Email', createdAt: 'Created' }

function SortHeader({ column, sortBy, sortDir, onToggle }) {
  const active = sortBy === column
  return (
    <th scope="col" className="py-2 pr-2 text-left font-medium">
      <button
        type="button"
        onClick={() => onToggle(column)}
        className="flex items-center gap-1 hover:text-ink"
      >
        {SORTABLE[column]}
        {active &&
          (sortDir === 'asc' ? (
            <ChevronUp size={14} aria-hidden="true" />
          ) : (
            <ChevronDown size={14} aria-hidden="true" />
          ))}
      </button>
    </th>
  )
}

export default function AdminUsers() {
  const { user: viewer } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const elevation = useElevatedActionFlow()

  const [usernameInput, setUsernameInput] = useState('')
  const [emailInput, setEmailInput] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('')
  const [role, setRole] = useState('')
  const [locked, setLocked] = useState('')
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortDir, setSortDir] = useState('desc')
  const [page, setPage] = useState(1)
  const [confirm, setConfirm] = useState(null) // { user, action }
  const [busy, setBusy] = useState(false)
  // Patches successful actions into the current page's rows until the next load replaces them.
  const [rowOverrides, setRowOverrides] = useState({})
  // Per-row unmasked email (Stage 20b), keyed by user id; shared hook since Stage 30.
  const unmask = useEmailUnmask()

  useEffect(() => {
    const t = setTimeout(() => setUsername(usernameInput.trim()), 300)
    return () => clearTimeout(t)
  }, [usernameInput])
  useEffect(() => {
    const t = setTimeout(() => setEmail(emailInput.trim()), 300)
    return () => clearTimeout(t)
  }, [emailInput])
  useEffect(() => {
    setPage(1)
  }, [username, email, status, role, locked, sortBy, sortDir])

  const params = useMemo(
    () => ({ page, username, email, status, role, locked, sortBy, sortDir }),
    [page, username, email, status, role, locked, sortBy, sortDir],
  )
  const { data, loading, error, reload } = useApi(() => listUsers(params), [params])
  const notice = useApiNotice({ loading: loading && !data, error }, 'users')
  const rows = (data?.users ?? []).map((u) => rowOverrides[u.id] ?? u)

  // Any refetch (filter/sort/page change, or a row action's reload()) re-masks every row and
  // clears their 60s timers, per the stage's rule.
  const { remaskAll } = unmask
  useEffect(() => {
    setRowOverrides({})
    remaskAll()
  }, [data, remaskAll])

  function toggleSort(column) {
    if (sortBy === column) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(column)
      setSortDir('asc')
    }
  }

  async function runAction(targetUser, action, reasonPayload) {
    setBusy(true)
    try {
      const updated =
        action === 'suspend' || action === 'unsuspend'
          ? await updateUserStatus(targetUser.id, action === 'suspend' ? 'suspended' : 'active', reasonPayload)
          : action === 'unlock'
            ? await unlockUser(targetUser.id)
            : await updateUserRole(targetUser.id, action === 'promote' ? 'admin' : 'user', reasonPayload)
      setRowOverrides((prev) => ({ ...prev, [updated.id]: updated }))
      setConfirm(null)
      showToast(ACTION_SUCCESS[action](targetUser.username), 'success')
    } catch (err) {
      if (err.code === 'ELEVATION_REQUIRED') {
        elevation.withElevation(() => runAction(targetUser, action, reasonPayload))
        return
      }
      setConfirm(null)
      showToast(describeError(err).message, 'error')
      reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-width page-gutter py-8 md:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-ink md:text-3xl">Manage users</h1>
        <div className="flex items-center gap-3">
          {elevation.isElevated && <ElevateTimer secondsLeft={elevation.secondsLeft} />}
          <Button
            variant="secondary"
            size="sm"
            onClick={elevation.openElevateModal}
            disabled={elevation.isElevated}
          >
            Elevate privileges
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_160px_160px_160px]">
        <input
          type="search"
          value={usernameInput}
          onChange={(e) => setUsernameInput(e.target.value)}
          placeholder="Search username"
          aria-label="Search by username"
          className={inputClass}
        />
        <input
          type="search"
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          placeholder="Search email (exact)"
          aria-label="Search by email"
          className={inputClass}
        />
        <SearchableSelect
          aria-label="Filter by status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={selectClass}
        >
          <option value="">Any status</option>
          <option value="pending">Pending</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </SearchableSelect>
        <SearchableSelect
          aria-label="Filter by role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className={selectClass}
        >
          <option value="">Any role</option>
          <option value="user">User</option>
          <option value="admin">Admin</option>
          <option value="super admin">Super admin</option>
        </SearchableSelect>
        <SearchableSelect
          aria-label="Filter by locked"
          value={locked}
          onChange={(e) => setLocked(e.target.value)}
          className={selectClass}
        >
          <option value="">Any lock state</option>
          <option value="true">Locked</option>
          <option value="false">Not locked</option>
        </SearchableSelect>
      </div>

      {notice}

      {!notice && (
        <>
          {rows.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                title="No users match those filters"
                body="Try clearing a filter or searching for something else."
              />
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-line text-ink-40">
                    <SortHeader
                      column="username"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onToggle={toggleSort}
                    />
                    <SortHeader
                      column="email"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onToggle={toggleSort}
                    />
                    <th scope="col" className="py-2 pr-2 text-left font-medium">
                      Status
                    </th>
                    <th scope="col" className="py-2 pr-2 text-left font-medium">
                      Role
                    </th>
                    <th scope="col" className="py-2 pr-2 text-left font-medium">
                      Credits
                    </th>
                    <th scope="col" className="py-2 pr-2 text-left font-medium">
                      Locked
                    </th>
                    <SortHeader
                      column="createdAt"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onToggle={toggleSort}
                    />
                    <th scope="col" className="py-2 pl-2">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => (
                    <tr
                      key={u.id}
                      onClick={() => navigate('/admin/user-transactions/' + u.id)}
                      className="group cursor-pointer border-b border-line last:border-0 hover:bg-surface-alt"
                    >
                      <td className="py-2.5 pr-2 font-medium text-ink">{u.username}</td>
                      <td className="py-2.5 pr-2 text-ink-70">
                        <span className="inline-flex items-center gap-1.5">
                          <span>{unmask.unmaskedEmails[u.id] ?? u.email}</span>
                          {canUnmaskEmail(viewer, u) && <EmailUnmaskButton user={u} unmask={unmask} />}
                        </span>
                      </td>
                      <td className="py-2.5 pr-2">
                        <Badge tone={STATUS_TONES[u.status]}>{STATUS_LABELS[u.status]}</Badge>
                      </td>
                      <td className="py-2.5 pr-2">
                        <Badge tone={ROLE_TONES[u.role]}>{ROLE_LABELS[u.role]}</Badge>
                      </td>
                      <td className="py-2.5 pr-2 text-ink-70">
                        <CreditsCell userId={u.id} />
                      </td>
                      <td className="py-2.5 pr-2">
                        {u.isLocked ? (
                          <Badge tone="border-alert text-alert" title={formatDateTime(u.lockedUntil)}>
                            Locked (level {u.lockLevel})
                          </Badge>
                        ) : (
                          <span className="text-ink-40">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-2 text-ink-70">{formatDate(u.createdAt)}</td>
                      <td className="py-2.5 pl-2 text-right" onClick={(e) => e.stopPropagation()}>
                        <RowMenu
                          user={u}
                          viewer={viewer}
                          onPick={(action) => elevation.withElevation(() => setConfirm({ user: u, action }))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Pager
            metadata={data ? { currPage: data.page, totalPages: data.totalPages } : null}
            onPage={setPage}
          />
        </>
      )}

      {confirm && (
        <ConfirmActionDialog
          user={confirm.user}
          action={confirm.action}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={(reasonPayload) => runAction(confirm.user, confirm.action, reasonPayload)}
        />
      )}

      {elevation.elevationModalOpen && (
        <ElevationOtpModal
          onClose={elevation.closeElevationModal}
          onVerified={elevation.handleElevated}
        />
      )}
    </div>
  )
}
