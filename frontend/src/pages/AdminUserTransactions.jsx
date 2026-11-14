/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-05
 * Scope: Created the admin user-history page, per instructions.md Stage 24 (F5.3.2): a user's
 *        profile (reusing AdminUsers.jsx's exact allowed-actions table, confirmation dialog and
 *        toast behaviour for suspend/unsuspend and promote/demote) plus a paginated, client-
 *        side-filterable list of their orders. A 404 on the profile call takes over the whole
 *        page ("user not found"); the orders list is its own section and fails/retries on its
 *        own. The page number lives in the URL (`page`) so a reload keeps it; filters do not.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: Stage 26e of instructions.md - the reused ConfirmActionDialog now requires a reason;
 *        runAction takes it through and forwards it to updateUserStatus/updateUserRole (both
 *        now require one, per Stage 26b).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-08, Codex, model: GPT-6): Replaced native dropdowns with the requested searchable control.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 27c of instructions.md - this page's Suspend/Unsuspend/Promote/Demote buttons
 *        call the same updateUserStatus/updateUserRole that AdminUsers.jsx does, which Stage
 *        27b now gates behind elevation, so they need the same gate even though the stage's
 *        Elevate button/timer are /admin/users-only. Reused useElevatedActionFlow
 *        (utils/elevation.js) rather than duplicating that logic: not elevated opens
 *        ElevationOtpModal before ConfirmActionDialog, elevated opens it straight away, and
 *        runAction's catch retries through the same open dialog on a mid-submit
 *        ELEVATION_REQUIRED, identically to AdminUsers.jsx.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-fable-5-1), date: 2026-11-10
 * Scope: Stage 30 of instructions.md - the profile section's email gets the same eye-icon
 *        unmask as /admin/users, via the shared useEmailUnmask hook (utils/emailUnmask.js) and
 *        EmailUnmaskButton extracted from AdminUsers.jsx. The icon is hidden for the caller's
 *        own page and a super admin's (canUnmaskEmail). Whenever the page replaces the profile
 *        object (initial load, an action's response, the failure-path refetch) the email
 *        re-masks and the timer clears, via an effect on shownProfile.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import SearchableSelect from '../components/SearchableSelect'
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Button from '../components/Button'
import ElevationOtpModal from '../components/ElevationOtpModal'
import EmailUnmaskButton from '../components/EmailUnmaskButton'
import EmptyState from '../components/EmptyState'
import { Pager } from '../components/ApiNotice'
import { useToast } from '../components/Toast'
import { useAuth } from '../context/AuthContext'
import { useApi } from '../api/useApi'
import { getUser, updateUserRole, updateUserStatus } from '../api/users'
import { listUserOrders } from '../api/orders'
import { useUserName, useSupplier } from '../api/lookups'
import { describeError } from '../api/errorMessages'
import { ACTION_SUCCESS, ConfirmActionDialog, getRowActions } from './AdminUsers'
import { useElevatedActionFlow } from '../utils/elevation'
import { canUnmaskEmail, useEmailUnmask } from '../utils/emailUnmask'

const STATUS_OPTIONS = [
  'pending',
  'open',
  'accepted',
  'picked_up',
  'delivered',
  'completed',
  'cancelled',
  'expired',
  'failed',
]

const statusLabel = (status) => status.replace('_', ' ').replace(/^./, (c) => c.toUpperCase())

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// Loading/logged-out/error gate for the whole page: the profile call is what every other
// section depends on, so its 404 ("user not found") replaces the entire page, per the stage's
// governing decision, rather than just its own section.
function useProfileNotice({ loading, error }) {
  const { isLoggedIn, sessionReady, requireAuth } = useAuth()
  if (!sessionReady || (isLoggedIn && loading)) {
    return <p className="mt-6 text-sm text-ink-40">Loading user…</p>
  }
  if (!isLoggedIn) {
    return (
      <div className="mt-6">
        <EmptyState
          title="Log in to see this user"
          body="This page needs an account."
          action={
            <Button size="sm" onClick={() => requireAuth('Log in to see this user.')}>
              Log in
            </Button>
          }
        />
      </div>
    )
  }
  if (error) {
    return (
      <div className="mt-6">
        <EmptyState
          title={
            error.status === 404
              ? 'User not found'
              : error.status === 403
                ? 'You do not have access to this'
                : 'Could not load this user'
          }
          body={error.status === 404 ? 'This user does not exist.' : error.message}
        />
      </div>
    )
  }
  return null
}

// A section that failed to load gets its own error and retry button; the rest of the page
// still renders, per the stage's "Section failures" rule.
function SectionError({ error, onRetry, what }) {
  return (
    <EmptyState
      title={error.status === 403 ? 'You do not have access to this' : 'Could not load ' + what}
      body={error.message}
      action={
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      }
    />
  )
}

function OrderRow({ entry, onOpen }) {
  const { order, role } = entry
  const requesterName = useUserName(order.requesterId) || 'User ' + order.requesterId.slice(-6)
  const courierName =
    useUserName(order.courierId) || (order.courierId ? 'User ' + order.courierId.slice(-6) : null)
  const supplier = useSupplier(order.supplierId)
  const supplierName = supplier?.name || 'Supplier ' + order.supplierId

  return (
    <tr
      onClick={() => onOpen(order.id)}
      className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-alt"
    >
      <td className="py-2.5 pr-2 font-medium text-ink">{order.id.slice(0, 8)}</td>
      <td className="py-2.5 pr-2 text-ink-70">
        {requesterName}
        {role === 'requester' && <span className="ml-1 text-xs text-ink-40">(this user)</span>}
      </td>
      <td className="py-2.5 pr-2 text-ink-70">{supplierName}</td>
      <td className="tnum py-2.5 pr-2 text-ink-70">{order.credits}</td>
      <td className="py-2.5 pr-2 text-ink-70">
        {courierName ?? <span className="text-ink-40">—</span>}
        {role === 'courier' && <span className="ml-1 text-xs text-ink-40">(this user)</span>}
      </td>
      <td className="py-2.5 pr-2 text-ink-70">{statusLabel(order.status)}</td>
    </tr>
  )
}

export default function AdminUserTransactions() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const { user: viewer } = useAuth()
  const { showToast } = useToast()
  const elevation = useElevatedActionFlow()
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Number(searchParams.get('page')) || 1

  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [profileOverride, setProfileOverride] = useState(null)

  const {
    data: profile,
    error: profileError,
    loading: profileLoading,
    reload: reloadProfile,
  } = useApi(() => getUser(userId), [userId])
  useEffect(() => setProfileOverride(null), [profile])
  const shownProfile = profileOverride ?? profile

  // Profile email eye icon (Stage 30). Any replacement of the profile object (retry, an
  // action's response, a stale-state refetch) re-masks the email and clears its timer.
  const unmask = useEmailUnmask()
  const { remaskAll } = unmask
  useEffect(() => {
    remaskAll()
  }, [shownProfile, remaskAll])

  const {
    data: ordersData,
    error: ordersError,
    loading: ordersLoading,
    reload: reloadOrders,
  } = useApi(() => listUserOrders(userId, page), [userId, page])

  const profileNotice = useProfileNotice({ loading: profileLoading, error: profileError })

  function setPage(next) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev)
      params.set('page', String(next))
      return params
    })
  }

  async function runAction(action, reasonPayload) {
    setBusy(true)
    try {
      const updated =
        action === 'suspend' || action === 'unsuspend'
          ? await updateUserStatus(userId, action === 'suspend' ? 'suspended' : 'active', reasonPayload)
          : await updateUserRole(userId, action === 'promote' ? 'admin' : 'user', reasonPayload)
      setProfileOverride(updated)
      setConfirm(null)
      showToast(ACTION_SUCCESS[action](shownProfile.username), 'success')
    } catch (err) {
      if (err.code === 'ELEVATION_REQUIRED') {
        elevation.withElevation(() => runAction(action, reasonPayload))
        return
      }
      setConfirm(null)
      showToast(describeError(err).message, 'error')
      reloadProfile()
    } finally {
      setBusy(false)
    }
  }

  if (profileNotice) {
    return (
      <div className="page-width page-gutter py-8 md:py-10">
        <Button variant="secondary" size="sm" onClick={() => navigate('/admin/users')}>
          ← Back to users
        </Button>
        {profileNotice}
      </div>
    )
  }
  if (!shownProfile) return null

  const actions = getRowActions(viewer, shownProfile)
  const orders = ordersData?.orders ?? []
  const filtered = orders.filter(
    (entry) =>
      (!roleFilter || entry.role === roleFilter) &&
      (!statusFilter || entry.order.status === statusFilter),
  )

  return (
    <div className="page-width page-gutter py-8 md:py-10">
      <Button variant="secondary" size="sm" onClick={() => navigate('/admin/users')}>
        ← Back to users
      </Button>

      <h1 className="mt-4 font-display text-2xl font-bold text-ink md:text-3xl">
        {shownProfile.username}
      </h1>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-ink-40">Email</dt>
          <dd className="inline-flex items-center gap-1.5 text-ink-70">
            <span>{unmask.unmaskedEmails[shownProfile.id] ?? shownProfile.email}</span>
            {canUnmaskEmail(viewer, shownProfile) && (
              <EmailUnmaskButton user={shownProfile} unmask={unmask} />
            )}
          </dd>
        </div>
        <div>
          <dt className="text-ink-40">Status</dt>
          <dd className="text-ink-70">{shownProfile.status}</dd>
        </div>
        <div>
          <dt className="text-ink-40">Role</dt>
          <dd className="text-ink-70">{shownProfile.role}</dd>
        </div>
        <div>
          <dt className="text-ink-40">Created</dt>
          <dd className="text-ink-70">{formatDate(shownProfile.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-ink-40">Updated</dt>
          <dd className="text-ink-70">{formatDate(shownProfile.updatedAt)}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        {actions.suspend === 'suspend' && (
          <Button
            size="sm"
            variant="danger"
            onClick={() => elevation.withElevation(() => setConfirm('suspend'))}
          >
            Suspend
          </Button>
        )}
        {actions.suspend === 'unsuspend' && (
          <Button size="sm" onClick={() => elevation.withElevation(() => setConfirm('unsuspend'))}>
            Unsuspend
          </Button>
        )}
        {actions.role === 'promote' && (
          <Button size="sm" onClick={() => elevation.withElevation(() => setConfirm('promote'))}>
            Promote to admin
          </Button>
        )}
        {actions.role === 'demote' && (
          <Button
            size="sm"
            variant="danger"
            onClick={() => elevation.withElevation(() => setConfirm('demote'))}
          >
            Demote to user
          </Button>
        )}
      </div>

      <section className="mt-10 border-t border-line pt-8">
        <h2 className="text-xl font-semibold text-ink">Orders</h2>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 sm:max-w-md">
          <SearchableSelect
            aria-label="Filter by role"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-11 rounded-btn border border-line bg-surface px-3 text-sm text-ink md:h-10"
          >
            <option value="">Any role</option>
            <option value="requester">Requester</option>
            <option value="courier">Courier</option>
          </SearchableSelect>
          <SearchableSelect
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-11 rounded-btn border border-line bg-surface px-3 text-sm text-ink md:h-10"
          >
            <option value="">Any status</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </SearchableSelect>
        </div>
        {(roleFilter || statusFilter) && (
          <p className="mt-2 text-xs text-ink-40">Filters apply to this page of orders only.</p>
        )}

        {ordersLoading && !ordersData && <p className="mt-6 text-sm text-ink-40">Loading orders…</p>}

        {ordersError && (
          <div className="mt-6">
            <SectionError error={ordersError} onRetry={reloadOrders} what="orders" />
          </div>
        )}

        {!ordersError && ordersData && (
          <>
            {filtered.length === 0 ? (
              <div className="mt-6">
                <EmptyState
                  title={orders.length === 0 ? 'No orders yet' : 'No orders match those filters'}
                  body={
                    orders.length === 0
                      ? 'This user has no orders.'
                      : 'Try clearing a filter, or check another page.'
                  }
                />
              </div>
            ) : (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-ink-40">
                      <th scope="col" className="py-2 pr-2 text-left font-medium">
                        Request ID
                      </th>
                      <th scope="col" className="py-2 pr-2 text-left font-medium">
                        Requester
                      </th>
                      <th scope="col" className="py-2 pr-2 text-left font-medium">
                        Supplier
                      </th>
                      <th scope="col" className="py-2 pr-2 text-left font-medium">
                        Credits
                      </th>
                      <th scope="col" className="py-2 pr-2 text-left font-medium">
                        Courier
                      </th>
                      <th scope="col" className="py-2 pr-2 text-left font-medium">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((entry) => (
                      <OrderRow
                        key={entry.order.id}
                        entry={entry}
                        onOpen={(orderId) =>
                          navigate('/admin/user-transactions/' + userId + '/' + orderId)
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <Pager
              metadata={{ currPage: ordersData.currentPage, totalPages: ordersData.totalPages }}
              onPage={setPage}
            />
          </>
        )}
      </section>

      {confirm && (
        <ConfirmActionDialog
          user={shownProfile}
          action={confirm}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={(reasonPayload) => runAction(confirm, reasonPayload)}
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
