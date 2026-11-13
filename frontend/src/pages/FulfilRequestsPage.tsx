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
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Pagination,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { acceptOrder, fetchAvailableRequests } from '../api/orders'
import { useAuth } from '../auth/AuthContext'
import { DeliveryBagIcon, IconBadge } from '../components/CampusArt'
import OrderCard from '../components/OrderCard'
import {
  clampPage,
  paginateItems,
  REQUESTS_PER_PAGE,
} from '../orders/clientPagination'
import type { Order } from '../orders/orderTypes'

type ListRequestResult = {
  key: number
  orders?: Order[]
  error?: string
}

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

function EmptySection({
  icon,
  title,
  description,
}: {
  icon: ReactNode
  title: string
  description: string
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
      </Stack>
    </Paper>
  )
}

function FulfilRequestsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [reloadCount, setReloadCount] = useState(0)
  const [result, setResult] = useState<ListRequestResult | null>(null)
  const [page, setPage] = useState(1)
  const [pendingOrder, setPendingOrder] = useState<Order | null>(null)
  const [actionOrderId, setActionOrderId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  const loading = result?.key !== reloadCount
  const orders = !loading ? (result?.orders ?? []) : []
  const errorMessage = !loading ? result?.error : undefined
  const safePage = clampPage(page, Math.ceil(orders.length / REQUESTS_PER_PAGE))
  const { items, page: listPage, totalPages, total } = paginateItems(
    orders,
    safePage,
    REQUESTS_PER_PAGE,
  )

  useEffect(() => {
    let ignore = false

    fetchAvailableRequests()
      .then((data) => {
        if (!ignore) {
          setResult({ key: reloadCount, orders: data })
          setPage(1)
        }
      })
      .catch((error: unknown) => {
        if (ignore) return
        console.error(error)
        setResult({ key: reloadCount, error: 'Available requests could not be loaded.' })
      })

    return () => {
      ignore = true
    }
  }, [reloadCount])

  async function handleAccept() {
    if (!pendingOrder) return

    const order = pendingOrder
    setPendingOrder(null)
    setActionOrderId(order.id)
    setActionError('')

    try {
      await acceptOrder(order.id)
      setReloadCount((count) => count + 1)
      navigate('/my-tasks?tab=active')
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Action failed. Please try again.',
      )
    } finally {
      setActionOrderId(null)
    }
  }

  return (
    <Container component="main" maxWidth="lg" sx={{ py: { xs: 3, md: 6 } }}>
      <Stack spacing={3}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <IconBadge tone="teal">
            <DeliveryBagIcon />
          </IconBadge>
          <Stack spacing={0.25}>
            <Typography component="h1" variant="h4">
              Fulfil Requests
            </Typography>
            <Typography color="text.secondary">
              See campus errand requests that are waiting to be fulfilled.
            </Typography>
          </Stack>
        </Stack>

        {actionError && (
          <Alert severity="error" onClose={() => setActionError('')}>
            {actionError}
          </Alert>
        )}

        {loading ? (
          <Box role="status" aria-label="Loading available requests" sx={orderGridSx}>
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
        ) : total === 0 ? (
          <EmptySection
            icon={<DeliveryBagIcon sx={{ fontSize: 40, color: 'secondary.main' }} />}
            title="No available requests"
            description="Check back later for new campus errands you can accept."
          />
        ) : (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              {total} open {total === 1 ? 'request' : 'requests'} waiting for a courier.
            </Typography>
            <Box sx={orderGridSx}>
              {items.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  variant="courier"
                  detailsTo={`/fulfil/${order.id}`}
                  actionPending={actionOrderId === order.id}
                  onCourierAction={
                    order.requester.id === user?.id
                      ? undefined
                      : (selected) => {
                          setPendingOrder(selected)
                        }
                  }
                />
              ))}
            </Box>
            {totalPages > 1 && (
              <Pagination
                count={totalPages}
                page={listPage}
                onChange={(_, newPage) => setPage(newPage)}
                color="secondary"
                sx={{ alignSelf: { xs: 'center', sm: 'flex-start' } }}
              />
            )}
          </Stack>
        )}
      </Stack>

      <Dialog open={pendingOrder !== null} onClose={() => setPendingOrder(null)}>
        <DialogTitle>Accept this request?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You will become the assigned courier for this campus errand.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingOrder(null)}>Back</Button>
          <Button variant="contained" color="secondary" onClick={() => void handleAccept()}>
            Accept
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  )
}

export default FulfilRequestsPage
