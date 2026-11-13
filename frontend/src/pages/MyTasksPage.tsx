/**
 * AI Assistance Disclosure
 * Tool: Cursor (GPT-5.6 Sol Medium)
 * Scope: Assisted with frontend implementation, debugging and UI refinement.
 * Author review: The generated code was reviewed, tested, and iteratively refined by the author through follow-up instructions.
 */

import { useEffect, useState, type ReactNode, type SyntheticEvent } from 'react'
import {
  Alert,
  Box,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Pagination,
  Paper,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchMyCourierTasks, markOrderPickedUp } from '../api/orders'
import { CheckTaskIcon, IconBadge } from '../components/CampusArt'
import OrderCard from '../components/OrderCard'
import {
  clampPage,
  paginateItems,
  REQUESTS_PER_PAGE,
} from '../orders/clientPagination'
import {
  isCourierTaskActive,
  type CourierAction,
  type Order,
} from '../orders/orderTypes'

type ListRequestResult = {
  key: number
  orders?: Order[]
  error?: string
}

type TaskTab = 'active' | 'past'

const TASK_TABS: TaskTab[] = ['active', 'past']

function parseTaskTab(value: string | null): TaskTab {
  if (value && TASK_TABS.includes(value as TaskTab)) {
    return value as TaskTab
  }
  return 'active'
}

const orderGridSx = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
  gap: 2,
}

const pickupCopy = {
  title: 'Mark as picked up?',
  body: 'Confirm only after you have collected the item from the supplier.',
  confirmLabel: 'Mark picked up',
}

function OrderCardSkeleton() {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 } }} aria-hidden="true">
      <Stack spacing={1.5}>
        <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
          <Skeleton width="55%" height={28} />
          <Skeleton variant="rounded" width={72} height={24} />
        </Stack>
        <Skeleton width="80%" />
        <Skeleton width="70%" />
        <Skeleton width="40%" />
        <Skeleton variant="rounded" width={110} height={30} />
      </Stack>
    </Paper>
  )
}

function EmptySection({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <Paper
      variant="outlined"
      sx={{ p: { xs: 3, md: 4 }, textAlign: 'center', bgcolor: 'background.paper' }}
    >
      <Stack spacing={1.5} sx={{ alignItems: 'center' }}>
        {icon}
        <Typography variant="h6">{title}</Typography>
        <Typography color="text.secondary">{description}</Typography>
        {action}
      </Stack>
    </Paper>
  )
}

function CourierTaskList({
  orders,
  page,
  onPageChange,
  emptyTitle,
  emptyDescription,
  emptyIcon,
  emptyAction,
  actionOrderId,
  onCourierAction,
}: {
  orders: Order[]
  page: number
  onPageChange: (page: number) => void
  emptyTitle: string
  emptyDescription: string
  emptyIcon: ReactNode
  emptyAction?: ReactNode
  actionOrderId: string | null
  onCourierAction: (order: Order, action: CourierAction) => void
}) {
  const { items, page: safePage, totalPages, total } = paginateItems(
    orders,
    page,
    REQUESTS_PER_PAGE,
  )

  if (total === 0) {
    return (
      <EmptySection
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    )
  }

  return (
    <Stack spacing={2}>
      <Box sx={orderGridSx}>
        {items.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            variant="courier"
            actionPending={actionOrderId === order.id}
            onCourierAction={onCourierAction}
          />
        ))}
      </Box>
      {totalPages > 1 && (
        <Pagination
          count={totalPages}
          page={safePage}
          onChange={(_, newPage) => onPageChange(newPage)}
          color="secondary"
          sx={{ alignSelf: { xs: 'center', sm: 'flex-start' } }}
        />
      )}
    </Stack>
  )
}

function MyTasksPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = parseTaskTab(searchParams.get('tab'))

  const [reloadCount, setReloadCount] = useState(0)
  const [tasksResult, setTasksResult] = useState<ListRequestResult | null>(null)
  const [activePage, setActivePage] = useState(1)
  const [pastPage, setPastPage] = useState(1)
  const [pendingOrder, setPendingOrder] = useState<Order | null>(null)
  const [actionOrderId, setActionOrderId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  const loading = tasksResult?.key !== reloadCount

  useEffect(() => {
    let ignore = false

    fetchMyCourierTasks()
      .then((tasks) => {
        if (ignore) return
        setTasksResult({ key: reloadCount, orders: tasks })
        setActivePage(1)
        setPastPage(1)
      })
      .catch((error: unknown) => {
        if (ignore) return
        console.error(error)
        setTasksResult({ key: reloadCount, error: 'Your tasks could not be loaded.' })
      })

    return () => {
      ignore = true
    }
  }, [reloadCount])

  const allTasks = tasksResult?.orders ?? []
  const activeTasks = allTasks.filter((order) => isCourierTaskActive(order.status))
  const pastTasks = allTasks.filter((order) => !isCourierTaskActive(order.status))

  const safeActivePage = clampPage(
    activePage,
    Math.ceil(activeTasks.length / REQUESTS_PER_PAGE),
  )
  const safePastPage = clampPage(pastPage, Math.ceil(pastTasks.length / REQUESTS_PER_PAGE))

  function handleTabChange(_event: SyntheticEvent, newTab: TaskTab) {
    setActionError('')
    setSearchParams(newTab === 'active' ? {} : { tab: newTab }, { replace: true })
  }

  async function handleConfirmPickup() {
    if (!pendingOrder) return

    const order = pendingOrder
    setPendingOrder(null)
    setActionOrderId(order.id)
    setActionError('')

    try {
      await markOrderPickedUp(order.id)
      setReloadCount((count) => count + 1)
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Action failed. Please try again.',
      )
    } finally {
      setActionOrderId(null)
    }
  }

  function handleCourierAction(order: Order, action: CourierAction) {
    if (action !== 'pick-up') return
    setPendingOrder(order)
  }

  return (
    <Container component="main" maxWidth="lg" sx={{ py: { xs: 3, md: 6 } }}>
      <Stack spacing={3}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <IconBadge tone="teal">
            <CheckTaskIcon />
          </IconBadge>
          <Stack spacing={0.25}>
            <Typography component="h1" variant="h4">
              My Tasks
            </Typography>
            <Typography color="text.secondary">
              Track campus errands assigned to you.
            </Typography>
          </Stack>
        </Stack>

        {actionError && (
          <Alert severity="error" onClose={() => setActionError('')}>
            {actionError}
          </Alert>
        )}

        {loading ? (
          <Box role="status" aria-label="Loading courier tasks" sx={orderGridSx}>
            <OrderCardSkeleton />
            <OrderCardSkeleton />
          </Box>
        ) : tasksResult?.error ? (
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
            {tasksResult.error}
          </Alert>
        ) : (
          <Stack spacing={2.5}>
            <Tabs
              value={tab}
              onChange={handleTabChange}
              variant="scrollable"
              allowScrollButtonsMobile
              aria-label="Courier task sections"
              sx={{ borderBottom: 1, borderColor: 'divider' }}
            >
              <Tab label={`Active Tasks (${activeTasks.length})`} value="active" />
              <Tab label={`Past Tasks (${pastTasks.length})`} value="past" />
            </Tabs>

            {tab === 'active' ? (
              <CourierTaskList
                orders={activeTasks}
                page={safeActivePage}
                onPageChange={setActivePage}
                emptyTitle="No active tasks"
                emptyDescription="Accept a request from Fulfil Requests to start your first task."
                emptyIcon={<CheckTaskIcon sx={{ fontSize: 40, color: 'secondary.main' }} />}
                emptyAction={
                  <Button component={Link} to="/fulfil" variant="contained" color="secondary">
                    Fulfil Requests
                  </Button>
                }
                actionOrderId={actionOrderId}
                onCourierAction={handleCourierAction}
              />
            ) : (
              <CourierTaskList
                orders={pastTasks}
                page={safePastPage}
                onPageChange={setPastPage}
                emptyTitle="No past tasks"
                emptyDescription="Completed, cancelled, and expired tasks will appear here."
                emptyIcon={<CheckTaskIcon sx={{ fontSize: 40, color: 'secondary.main' }} />}
                actionOrderId={actionOrderId}
                onCourierAction={handleCourierAction}
              />
            )}
          </Stack>
        )}
      </Stack>

      <Dialog open={pendingOrder !== null} onClose={() => setPendingOrder(null)}>
        <DialogTitle>{pickupCopy.title}</DialogTitle>
        <DialogContent>
          <DialogContentText>{pickupCopy.body}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingOrder(null)}>Back</Button>
          <Button variant="contained" color="secondary" onClick={() => void handleConfirmPickup()}>
            {pickupCopy.confirmLabel}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  )
}

export default MyTasksPage
