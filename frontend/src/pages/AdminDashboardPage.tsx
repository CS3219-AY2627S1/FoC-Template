/**
 * AI Assistance Disclosure
 * Tool: Cursor (GPT-5.6 Sol Medium)
 * Scope: Assisted with frontend implementation, debugging and UI refinement.
 * Author review: The generated code was reviewed, tested, and iteratively refined by the author through follow-up instructions.
 */

import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  MenuItem,
  Pagination,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchAdminOrders } from '../api/orders'
import {
  ForbiddenError,
  NotFoundError,
  listUsers,
  updateUserStatus,
} from '../api/users'
import { useAuth } from '../auth/AuthContext'
import {
  CampusBuildingIcon,
  ClipboardIcon,
  StudentIcon,
} from '../components/CampusArt'
import ManageRolesDialog from '../components/ManageRolesDialog'
import SuccessSnackbar from '../components/SuccessSnackbar'
import OrderStatusChip from '../components/OrderStatusChip'
import type { AdminUser, Role, UserListResponse } from '../interfaces'
import {
  formatOrderId,
  orderStatusDisplay,
  type Order,
  type OrderStatus,
} from '../orders/orderTypes'

type AdminSection = 'users' | 'suppliers' | 'orders'

const userTableColumns = ['Username', 'Email', 'Roles', 'Status', 'Actions']

const USERS_PER_PAGE = 20
const ORDERS_PER_PAGE = 20
const ADMIN_ORDER_STATUSES: OrderStatus[] = [
  'OPEN',
  'ACCEPTED',
  'PICKED_UP',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
]

const roleChips: Record<Role, { label: string; color: 'default' | 'primary' | 'secondary' }> = {
  ADMIN: { label: 'Admin', color: 'default' },
  REQUESTER: { label: 'Requester', color: 'primary' },
  COURIER: { label: 'Courier', color: 'secondary' },
}

const sectionPaperSx = {
  p: { xs: 2, md: 3 },
  bgcolor: 'background.paper',
  boxShadow: '0 12px 32px rgba(23, 35, 45, 0.06)',
}

function SectionHeader({
  icon,
  title,
  description,
}: {
  icon: ReactNode
  title: string
  description: string
}) {
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
      <Box
        sx={{
          display: 'grid',
          width: 56,
          height: 56,
          flexShrink: 0,
          placeItems: 'center',
          borderRadius: '50%',
          color: '#9A3412',
          bgcolor: '#FFEDD5',
        }}
      >
        {icon}
      </Box>
      <Stack spacing={0.25}>
        <Typography variant="h6">{title}</Typography>
        <Typography color="text.secondary">{description}</Typography>
      </Stack>
    </Stack>
  )
}

function TableMessageRow({
  children,
  colSpan = userTableColumns.length,
}: {
  children: ReactNode
  colSpan?: number
}) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} align="center" sx={{ py: 4, color: 'text.secondary' }}>
        {children}
      </TableCell>
    </TableRow>
  )
}

type UsersRequestResult = {
  key: string
  data?: UserListResponse
  error?: string
}

function UsersSection() {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [reloadCount, setReloadCount] = useState(0)
  const [result, setResult] = useState<UsersRequestResult | null>(null)
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [successMessage, setSuccessMessage] = useState('')
  const [deactivateTarget, setDeactivateTarget] = useState<AdminUser | null>(null)
  const [pendingStatusUserId, setPendingStatusUserId] = useState<string | null>(null)
  const [statusError, setStatusError] = useState('')
  const { user: currentUser } = useAuth()

  const requestKey = `${page}|${search}|${reloadCount}`
  const loading = result?.key !== requestKey
  const users = !loading ? (result?.data?.users ?? []) : []
  const pagination = result?.data?.pagination
  const errorMessage = !loading ? result?.error : undefined

  useEffect(() => {
    let ignore = false

    listUsers({ page, limit: USERS_PER_PAGE, search })
      .then((data) => {
        if (!ignore) setResult({ key: requestKey, data })
      })
      .catch((error: unknown) => {
        if (ignore) return
        const message =
          error instanceof ForbiddenError
            ? 'You do not have permission to view users.'
            : error instanceof Error
              ? error.message
              : 'Failed to load users.'
        setResult({ key: requestKey, error: message })
      })

    return () => {
      ignore = true
    }
  }, [page, search, requestKey])

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSearch(searchInput.trim())
    setPage(1)
  }

  function handleClearSearch() {
    setSearchInput('')
    setSearch('')
    setPage(1)
  }

  function updateUserRow(userId: string, changes: Partial<AdminUser>) {
    setResult((previous) => {
      if (!previous?.data) return previous
      return {
        ...previous,
        data: {
          ...previous.data,
          users: previous.data.users.map((user) =>
            user.id === userId ? { ...user, ...changes } : user,
          ),
        },
      }
    })
  }

  function handleRolesChanged(userId: string, roles: Role[], message: string) {
    updateUserRow(userId, { roles })
    setSuccessMessage(message)
  }

  async function changeUserStatus(user: AdminUser, isActive: boolean) {
    setDeactivateTarget(null)
    setPendingStatusUserId(user.id)
    setStatusError('')

    try {
      const updatedUser = await updateUserStatus(user.id, isActive)
      updateUserRow(user.id, updatedUser)
      setSuccessMessage(
        isActive
          ? `Reactivated ${user.username}.`
          : `Deactivated ${user.username}.`,
      )
    } catch (error) {
      setStatusError(
        error instanceof ForbiddenError
          ? 'Only admins can change account status.'
          : error instanceof NotFoundError
            ? 'User not found.'
            : error instanceof Error
              ? error.message
              : 'Failed to update account status.',
      )
    } finally {
      setPendingStatusUserId(null)
    }
  }

  return (
    <Paper variant="outlined" sx={sectionPaperSx}>
      <Stack spacing={2.5}>
        <SectionHeader
          icon={<StudentIcon sx={{ fontSize: 28 }} />}
          title="Users"
          description="View accounts and manage their roles."
        />

        <Stack
          component="form"
          onSubmit={handleSearch}
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
        >
          <TextField
            size="small"
            label="Search by username or email"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            sx={{ flex: 1 }}
          />
          <Stack direction="row" spacing={1}>
            <Button type="submit" variant="contained">
              Search
            </Button>
            {search && (
              <Button variant="text" onClick={handleClearSearch}>
                Clear
              </Button>
            )}
          </Stack>
        </Stack>

        {errorMessage && (
          <Alert
            severity="error"
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => setReloadCount((count) => count + 1)}
              >
                Retry
              </Button>
            }
          >
            {errorMessage}
          </Alert>
        )}

        {statusError && (
          <Alert severity="error" onClose={() => setStatusError('')}>
            {statusError}
          </Alert>
        )}

        <TableContainer
          sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}
        >
          <Table size="small" aria-label="Users">
            <TableHead>
              <TableRow>
                {userTableColumns.map((column) => (
                  <TableCell key={column} sx={{ fontWeight: 700 }}>
                    {column}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableMessageRow>
                  <CircularProgress size={28} aria-label="Loading users" />
                </TableMessageRow>
              )}

              {!loading && !errorMessage && users.length === 0 && (
                <TableMessageRow>
                  {search
                    ? `No users match "${search}".`
                    : 'No users found.'}
                </TableMessageRow>
              )}

              {!loading &&
                users.map((user) => (
                  <TableRow key={user.id} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {user.username}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {user.firstName} {user.lastName}
                      </Typography>
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                        {user.roles.map((role) => (
                          <Chip
                            key={role}
                            size="small"
                            label={roleChips[role].label}
                            color={roleChips[role].color}
                          />
                        ))}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={user.isActive ? 'Active' : 'Inactive'}
                        color={user.isActive ? 'success' : 'default'}
                      />
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1}>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => setSelectedUser(user)}
                          sx={{ whiteSpace: 'nowrap' }}
                        >
                          Manage Roles
                        </Button>
                        {user.isActive ? (
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            disabled={
                              user.id === currentUser?.id ||
                              pendingStatusUserId === user.id
                            }
                            title={
                              user.id === currentUser?.id
                                ? 'You cannot deactivate your own account.'
                                : undefined
                            }
                            onClick={() => setDeactivateTarget(user)}
                            sx={{ whiteSpace: 'nowrap' }}
                          >
                            {pendingStatusUserId === user.id ? 'Deactivating…' : 'Deactivate'}
                          </Button>
                        ) : (
                          <Button
                            size="small"
                            variant="outlined"
                            color="success"
                            disabled={pendingStatusUserId === user.id}
                            onClick={() => void changeUserStatus(user, true)}
                            sx={{ whiteSpace: 'nowrap' }}
                          >
                            {pendingStatusUserId === user.id ? 'Reactivating…' : 'Reactivate'}
                          </Button>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>

        {pagination && pagination.total > 0 && (
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            sx={{ alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Typography variant="body2" color="text.secondary">
              {pagination.total} {pagination.total === 1 ? 'user' : 'users'}
            </Typography>
            {pagination.totalPages > 1 && (
              <Pagination
                count={pagination.totalPages}
                page={page}
                onChange={(_, newPage) => setPage(newPage)}
                color="primary"
              />
            )}
          </Stack>
        )}
      </Stack>

      <Dialog
        open={Boolean(deactivateTarget)}
        onClose={() => setDeactivateTarget(null)}
      >
        <DialogTitle>Deactivate {deactivateTarget?.username}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {deactivateTarget?.username} will be signed out and will not be able
            to log in until an Admin reactivates the account.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeactivateTarget(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              if (deactivateTarget) void changeUserStatus(deactivateTarget, false)
            }}
          >
            Deactivate
          </Button>
        </DialogActions>
      </Dialog>

      {selectedUser && (
        <ManageRolesDialog
          key={selectedUser.id}
          user={selectedUser}
          currentUserId={currentUser?.id}
          onClose={() => setSelectedUser(null)}
          onRolesChanged={handleRolesChanged}
        />
      )}

      <SuccessSnackbar
        open={Boolean(successMessage)}
        message={successMessage}
        onClose={() => setSuccessMessage('')}
      />
    </Paper>
  )
}

function SuppliersSection() {
  return (
    <Paper variant="outlined" sx={sectionPaperSx}>
      <Stack spacing={2.5}>
        <SectionHeader
          icon={<CampusBuildingIcon sx={{ fontSize: 28 }} />}
          title="Suppliers"
          description="Add, edit, and remove campus suppliers."
        />
        <Box>
          <Button variant="contained" component={Link} to="/suppliers">
            Go to Suppliers
          </Button>
        </Box>
      </Stack>
    </Paper>
  )
}

const orderTableColumns = [
  'Order ID',
  'Title',
  'Requester',
  'Courier',
  'Supplier',
  'Delivery location',
  'Credits',
  'Status',
  'Acceptance deadline',
  'Created',
]

type AdminOrdersResult = {
  key: string
  orders?: Order[]
  total?: number
  error?: string
}

function formatAdminDateTime(value: string | null): string {
  if (!value) return 'Not set'
  return new Date(value).toLocaleString('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function participantLabel(participant: Order['requester']): string {
  const name = [participant.firstName, participant.lastName].filter(Boolean).join(' ')
  return name || participant.username
}

function orderMatchesPageSearch(order: Order, search: string): boolean {
  const courierName = order.courier ? participantLabel(order.courier) : 'Not assigned'
  const haystack = [
    order.id,
    formatOrderId(order.id),
    order.title ?? '',
    order.itemDescription,
    participantLabel(order.requester),
    order.requester.username,
    courierName,
    order.courier?.username ?? '',
    order.pickup.supplierName,
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(search)
}

function OrdersSection() {
  const [status, setStatus] = useState<OrderStatus>('OPEN')
  const [page, setPage] = useState(1)
  const [pageSearch, setPageSearch] = useState('')
  const [reloadCount, setReloadCount] = useState(0)
  const [result, setResult] = useState<AdminOrdersResult | null>(null)

  const requestKey = `${status}|${page}|${reloadCount}`
  const loading = result?.key !== requestKey
  const orders = !loading ? (result?.orders ?? []) : []
  const total = !loading ? (result?.total ?? 0) : 0
  const errorMessage = !loading ? result?.error : undefined
  const search = pageSearch.trim().toLowerCase()
  const visibleOrders = search
    ? orders.filter((order) => orderMatchesPageSearch(order, search))
    : orders
  const pageCount = Math.max(1, Math.ceil(total / ORDERS_PER_PAGE))

  useEffect(() => {
    let ignore = false

    fetchAdminOrders({
      status,
      limit: ORDERS_PER_PAGE,
      offset: (page - 1) * ORDERS_PER_PAGE,
    })
      .then((data) => {
        if (!ignore) {
          setResult({ key: requestKey, orders: data.orders, total: data.total })
        }
      })
      .catch((error: unknown) => {
        if (ignore) return
        console.error(error)
        const message =
          error instanceof ForbiddenError
            ? 'You do not have permission to view these orders.'
            : 'Orders could not be loaded.'
        setResult({ key: requestKey, error: message })
      })

    return () => {
      ignore = true
    }
  }, [status, page, requestKey])

  return (
    <Paper variant="outlined" sx={sectionPaperSx}>
      <Stack spacing={2.5}>
        <SectionHeader
          icon={<ClipboardIcon sx={{ fontSize: 28 }} />}
          title="Orders"
          description="Review orders recorded by Order Service."
        />

        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          sx={{ alignItems: { md: 'center' } }}
        >
          <TextField
            select
            label="Status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as OrderStatus)
              setPage(1)
              setPageSearch('')
            }}
            sx={{ minWidth: 180 }}
          >
            {ADMIN_ORDER_STATUSES.map((orderStatus) => (
              <MenuItem key={orderStatus} value={orderStatus}>
                {orderStatusDisplay[orderStatus].label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Search this page"
            value={pageSearch}
            onChange={(event) => setPageSearch(event.target.value)}
            placeholder="Order id, title, name, or supplier"
            sx={{ flex: 1 }}
          />
        </Stack>
        <Typography variant="body2" color="text.secondary">
          Status is loaded from Order Service. Search only checks the orders on this page.
          {status === 'OPEN'
            ? ' Open orders past the acceptance deadline are left out of this list.'
            : ''}
        </Typography>

        {errorMessage && (
          <Alert
            severity="error"
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => setReloadCount((count) => count + 1)}
              >
                Retry
              </Button>
            }
          >
            {errorMessage}
          </Alert>
        )}

        <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
          <Table size="small" aria-label="Orders">
            <TableHead>
              <TableRow>
                {orderTableColumns.map((column) => (
                  <TableCell key={column} sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {column}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableMessageRow colSpan={orderTableColumns.length}>
                  <CircularProgress size={28} aria-label="Loading orders" />
                </TableMessageRow>
              )}

              {!loading && !errorMessage && visibleOrders.length === 0 && (
                <TableMessageRow colSpan={orderTableColumns.length}>
                  {orders.length === 0 ? 'No orders found.' : 'No orders on this page match that search.'}
                </TableMessageRow>
              )}

              {!loading &&
                visibleOrders.map((order) => (
                  <TableRow key={order.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Button
                        component={Link}
                        to={`/admin/orders/${order.id}`}
                        variant="text"
                        size="small"
                        sx={{ fontFamily: 'monospace', px: 0, minWidth: 0 }}
                      >
                        {formatOrderId(order.id)}
                      </Button>
                    </TableCell>
                    <TableCell sx={{ minWidth: 160 }}>{order.title || order.itemDescription}</TableCell>
                    <TableCell>{participantLabel(order.requester)}</TableCell>
                    <TableCell>
                      {order.courier ? participantLabel(order.courier) : 'Not assigned'}
                    </TableCell>
                    <TableCell>{order.pickup.supplierName}</TableCell>
                    <TableCell>{order.deliveryLocation}</TableCell>
                    <TableCell>{order.creditAmount}</TableCell>
                    <TableCell>
                      <OrderStatusChip status={order.status} />
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {formatAdminDateTime(order.acceptanceDeadline)}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {formatAdminDateTime(order.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>

        {!loading && !errorMessage && total > 0 && (
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
          >
            <Typography variant="body2" color="text.secondary">
              {total} {total === 1 ? 'order' : 'orders'}
            </Typography>
            {total > ORDERS_PER_PAGE && (
              <Pagination
                page={Math.min(page, pageCount)}
                count={pageCount}
                onChange={(_event, nextPage) => {
                  setPage(nextPage)
                  setPageSearch('')
                }}
                color="primary"
              />
            )}
          </Stack>
        )}
      </Stack>
    </Paper>
  )
}

const adminAccent = '#C2410C'
const adminAccentSoft = '#FFEDD5'
const adminAccentDeep = '#9A3412'

function AdminDashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const sectionParam = searchParams.get('section')
  const section: AdminSection =
    sectionParam === 'suppliers' || sectionParam === 'orders' ? sectionParam : 'users'

  function handleSectionChange(_event: unknown, newSection: AdminSection) {
    if (newSection === 'users') {
      setSearchParams({}, { replace: true })
      return
    }
    setSearchParams({ section: newSection }, { replace: true })
  }

  return (
    <Container component="main" maxWidth="lg" sx={{ py: { xs: 3, md: 6 } }}>
      <Stack spacing={3}>
        <Paper
          variant="outlined"
          sx={{
            p: { xs: 2, md: 2.5 },
            borderColor: '#FDBA74',
            bgcolor: '#FFFBF7',
            borderLeft: `4px solid ${adminAccent}`,
            boxShadow: '0 10px 28px rgba(154, 52, 18, 0.06)',
          }}
        >
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
          >
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Box
                sx={{
                  display: 'grid',
                  width: 56,
                  height: 56,
                  flexShrink: 0,
                  placeItems: 'center',
                  borderRadius: '50%',
                  color: '#FFF7ED',
                  bgcolor: adminAccentDeep,
                }}
              >
                <StudentIcon />
              </Box>
              <Stack spacing={0.25}>
                <Typography
                  variant="overline"
                  sx={{ fontWeight: 700, letterSpacing: '0.1em', color: adminAccentDeep }}
                >
                  Administrative workspace
                </Typography>
                <Typography component="h1" variant="h4">
                  Admin Dashboard
                </Typography>
                <Typography color="text.secondary">
                  Manage users, suppliers, and orders across FoC.
                </Typography>
              </Stack>
            </Stack>
            <Chip
              label="Admin"
              size="small"
              sx={{
                alignSelf: { xs: 'flex-start', sm: 'center' },
                bgcolor: adminAccentSoft,
                color: adminAccentDeep,
                fontWeight: 700,
              }}
            />
          </Stack>
        </Paper>

        <Tabs
          value={section}
          onChange={handleSectionChange}
          variant="scrollable"
          allowScrollButtonsMobile
          aria-label="Admin sections"
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
            '& .MuiTab-root.Mui-selected': { color: adminAccentDeep },
            '& .MuiTabs-indicator': { bgcolor: adminAccent },
          }}
        >
          <Tab label="Users" value="users" />
          <Tab label="Suppliers" value="suppliers" />
          <Tab label="Orders" value="orders" />
        </Tabs>

        {section === 'users' && <UsersSection />}
        {section === 'suppliers' && <SuppliersSection />}
        {section === 'orders' && <OrdersSection />}
      </Stack>
    </Container>
  )
}

export default AdminDashboardPage
