/**
 * AI Assistance Disclosure
 * Tool: Cursor (GPT-5.6 Sol Medium)
 * Scope: Assisted with frontend implementation, debugging and UI refinement.
 * Author review: The generated code was reviewed, tested, and iteratively refined by the author through follow-up instructions.
 */

import { useEffect, useState, type ReactNode } from 'react'
import {
  Alert,
  Box,
  Button,
  Container,
  Pagination,
  Paper,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material'
import { Link } from 'react-router-dom'
import { fetchMyRequests } from '../api/orders'
import { ClipboardIcon, IconBadge } from '../components/CampusArt'
import OrderCard from '../components/OrderCard'
import {
  clampPage,
  paginateItems,
  REQUESTS_PER_PAGE,
} from '../orders/clientPagination'
import { isOrderActive, type Order } from '../orders/orderTypes'

type OrdersRequestResult = {
  key: number
  orders?: Order[]
  error?: string
}

type RequestTab = 'active' | 'past'

const orderGridSx = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
  gap: 2,
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

function EmptyRequests({
  title,
  description,
  showBrowse,
  icon,
}: {
  title: string
  description: string
  showBrowse?: boolean
  icon?: ReactNode
}) {
  return (
    <Paper
      variant="outlined"
      sx={{ p: { xs: 3, md: 4 }, textAlign: 'center', bgcolor: 'background.paper' }}
    >
      <Stack spacing={1.5} sx={{ alignItems: 'center' }}>
        {icon ?? <ClipboardIcon sx={{ fontSize: 40, color: 'primary.main' }} />}
        <Typography variant="h6">{title}</Typography>
        <Typography color="text.secondary">{description}</Typography>
        {showBrowse && (
          <Button component={Link} to="/suppliers" variant="contained">
            Browse suppliers
          </Button>
        )}
      </Stack>
    </Paper>
  )
}

function RequestList({
  orders,
  page,
  onPageChange,
  emptyTitle,
  emptyDescription,
  showBrowse,
}: {
  orders: Order[]
  page: number
  onPageChange: (page: number) => void
  emptyTitle: string
  emptyDescription: string
  showBrowse?: boolean
}) {
  const { items, page: safePage, totalPages, total } = paginateItems(
    orders,
    page,
    REQUESTS_PER_PAGE,
  )

  if (total === 0) {
    return (
      <EmptyRequests
        title={emptyTitle}
        description={emptyDescription}
        showBrowse={showBrowse}
      />
    )
  }

  return (
    <Stack spacing={2}>
      <Box sx={orderGridSx}>
        {items.map((order) => (
          <OrderCard key={order.id} order={order} />
        ))}
      </Box>
      {totalPages > 1 && (
        <Pagination
          count={totalPages}
          page={safePage}
          onChange={(_, newPage) => onPageChange(newPage)}
          color="primary"
          sx={{ alignSelf: { xs: 'center', sm: 'flex-start' } }}
        />
      )}
    </Stack>
  )
}

function MyRequestsPage() {
  const [reloadCount, setReloadCount] = useState(0)
  const [result, setResult] = useState<OrdersRequestResult | null>(null)
  const [tab, setTab] = useState<RequestTab>('active')
  const [activePage, setActivePage] = useState(1)
  const [pastPage, setPastPage] = useState(1)

  const loading = result?.key !== reloadCount
  const orders = !loading ? result?.orders : undefined
  const errorMessage = !loading ? result?.error : undefined

  useEffect(() => {
    let ignore = false

    fetchMyRequests()
      .then((data) => {
        if (!ignore) {
          setResult({ key: reloadCount, orders: data })
          setActivePage(1)
          setPastPage(1)
        }
      })
      .catch((error: unknown) => {
        if (ignore) return
        console.error(error)
        setResult({ key: reloadCount, error: 'Your requests could not be loaded.' })
      })

    return () => {
      ignore = true
    }
  }, [reloadCount])

  const activeOrders = orders?.filter((order) => isOrderActive(order.status)) ?? []
  const pastOrders = orders?.filter((order) => !isOrderActive(order.status)) ?? []
  const safeActivePage = clampPage(
    activePage,
    Math.ceil(activeOrders.length / REQUESTS_PER_PAGE),
  )
  const safePastPage = clampPage(pastPage, Math.ceil(pastOrders.length / REQUESTS_PER_PAGE))

  return (
    <Container component="main" maxWidth="lg" sx={{ py: { xs: 3, md: 6 } }}>
      <Stack spacing={3}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
        >
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <IconBadge tone="blue">
              <ClipboardIcon />
            </IconBadge>
            <Stack spacing={0.25}>
              <Typography component="h1" variant="h4">
                My Requests
              </Typography>
              <Typography color="text.secondary">
                Track your campus errand requests in one place.
              </Typography>
            </Stack>
          </Stack>

          <Button
            component={Link}
            to="/suppliers"
            variant="contained"
            sx={{ alignSelf: { xs: 'flex-start', sm: 'auto' } }}
          >
            New request
          </Button>
        </Stack>

        {loading ? (
          <Box role="status" aria-label="Loading requests" sx={orderGridSx}>
            <OrderCardSkeleton />
            <OrderCardSkeleton />
          </Box>
        ) : errorMessage ? (
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
        ) : (
          <Stack spacing={2.5}>
            <Tabs
              value={tab}
              onChange={(_event, newTab: RequestTab) => setTab(newTab)}
              variant="scrollable"
              allowScrollButtonsMobile
              aria-label="Request sections"
              sx={{ borderBottom: 1, borderColor: 'divider' }}
            >
              <Tab label={`Active Requests (${activeOrders.length})`} value="active" />
              <Tab label={`Past Requests (${pastOrders.length})`} value="past" />
            </Tabs>

            {tab === 'active' ? (
              <RequestList
                orders={activeOrders}
                page={safeActivePage}
                onPageChange={setActivePage}
                emptyTitle="No active requests"
                emptyDescription="Browse suppliers to create your first campus errand request."
                showBrowse
              />
            ) : (
              <RequestList
                orders={pastOrders}
                page={safePastPage}
                onPageChange={setPastPage}
                emptyTitle="No past requests"
                emptyDescription="Completed, cancelled, and expired requests will appear here."
              />
            )}
          </Stack>
        )}
      </Stack>
    </Container>
  )
}

export default MyRequestsPage
