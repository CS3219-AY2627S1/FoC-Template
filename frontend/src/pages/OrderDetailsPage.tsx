/**
 * AI Assistance Disclosure
 * Tool: Cursor (GPT-5.6 Sol Medium)
 * Scope: Assisted with frontend implementation, debugging and UI refinement.
 * Author review: The generated code was reviewed, tested, and iteratively refined by the author through follow-up instructions.
 */

import { useEffect, useState } from 'react'
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
  Divider,
  Paper,
  Skeleton,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { NotFoundError } from '../api/client'
import {
  acceptOrder,
  cancelOrder,
  confirmDelivery,
  fetchOrderById,
  markOrderDelivered,
  markOrderPickedUp,
} from '../api/orders'
import OrderStatusChip from '../components/OrderStatusChip'
import {
  canCourierAccept,
  canCourierMarkDelivered,
  canCourierMarkPickedUp,
  canReorder,
  canRequesterCancel,
  canRequesterConfirmDelivery,
  formatOrderId,
  formatParticipantName,
  formatPickupLocation,
  orderProgressSteps,
  orderStatusDisplay,
  reorderPath,
  type Order,
  type OrderStatus,
} from '../orders/orderTypes'

type OrderRequestResult = {
  key: string
  order?: Order
  error?: 'not-found' | 'failed'
}

type PendingAction =
  | 'cancel'
  | 'confirm'
  | 'accept'
  | 'pick-up'
  | 'deliver'

const actionCopy: Record<
  PendingAction,
  { title: string; body: string; confirmLabel: string; color: 'error' | 'primary' | 'secondary' }
> = {
  cancel: {
    title: 'Cancel this request?',
    body: 'The request will be cancelled. This cannot be undone.',
    confirmLabel: 'Cancel request',
    color: 'error',
  },
  confirm: {
    title: 'Confirm delivery?',
    body: 'Confirm only after you have received the item. This completes the request.',
    confirmLabel: 'Confirm delivery',
    color: 'primary',
  },
  accept: {
    title: 'Accept this request?',
    body: 'You will become the assigned courier for this campus errand.',
    confirmLabel: 'Accept',
    color: 'secondary',
  },
  'pick-up': {
    title: 'Mark as picked up?',
    body: 'Confirm only after you have collected the item from the supplier.',
    confirmLabel: 'Mark picked up',
    color: 'secondary',
  },
  deliver: {
    title: 'Mark as delivered?',
    body: 'Confirm only after you have handed the item to the requester.',
    confirmLabel: 'Mark delivered',
    color: 'secondary',
  },
}

function formatDateTime(value: string | null): string {
  if (!value) return 'Not set'
  return new Date(value).toLocaleString('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <Stack spacing={0.25}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 500, overflowWrap: 'anywhere' }}>{value}</Typography>
    </Stack>
  )
}

function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Button component={Link} to={to} variant="text" sx={{ alignSelf: 'flex-start' }}>
      {label}
    </Button>
  )
}

function OrderProgress({ order }: { order: Order }) {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const activeStep = orderProgressSteps.indexOf(order.status)
  const stepTimes: Partial<Record<OrderStatus, string | null | undefined>> = {
    OPEN: order.createdAt,
    ACCEPTED: order.acceptedAt,
    PICKED_UP: order.pickedUpAt,
    COMPLETED: order.completedAt,
  }

  if (activeStep === -1) {
    const endedAt = order.status === 'CANCELLED' ? order.cancelledAt : order.expiredAt
    return (
      <Alert severity={order.status === 'CANCELLED' ? 'warning' : 'info'}>
        {orderStatusDisplay[order.status].description}
        {endedAt ? ` ${formatDateTime(endedAt)}.` : ''}
      </Alert>
    )
  }

  return (
    <Stepper
      activeStep={order.status === 'COMPLETED' ? orderProgressSteps.length : activeStep}
      alternativeLabel={!isMobile}
      orientation={isMobile ? 'vertical' : 'horizontal'}
      sx={{ '& .MuiStepLabel-label': { fontWeight: 650 } }}
    >
      {orderProgressSteps.map((status) => {
        const stepTime = stepTimes[status]
        return (
          <Step key={status}>
            <StepLabel
              optional={
                stepTime ? (
                  <Typography variant="caption">{formatDateTime(stepTime)}</Typography>
                ) : undefined
              }
            >
              {orderStatusDisplay[status].label}
            </StepLabel>
          </Step>
        )
      })}
    </Stepper>
  )
}

function OrderDetailsSkeleton() {
  return (
    <Stack spacing={3} role="status" aria-label="Loading request">
      <Skeleton width="45%" height={44} />
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
        <Stack spacing={1.5}>
          <Skeleton height={48} />
          <Skeleton width="80%" />
          <Skeleton width="65%" />
          <Skeleton width="50%" />
        </Stack>
      </Paper>
    </Stack>
  )
}

type DetailContext = 'requester' | 'fulfil' | 'tasks' | 'admin'

function resolveDetailContext(
  pathname: string,
  order: Order | undefined,
  userId: string | undefined,
): DetailContext {
  if (pathname.startsWith('/admin/orders/')) return 'admin'
  const onFulfil = pathname.startsWith('/fulfil/')
  const onTasks = pathname.startsWith('/my-tasks/')
  if (!onFulfil && !onTasks) return 'requester'
  if (!order) return onFulfil ? 'fulfil' : 'tasks'

  const assignedToMe = Boolean(
    userId && (order.courier?.id === userId || order.courierId === userId),
  )
  if (assignedToMe) return 'tasks'
  // OPEN and not this courier: still in the available-requests workflow.
  if (order.status === 'OPEN') return 'fulfil'
  return onFulfil ? 'fulfil' : 'tasks'
}

function OrderDetailsPage() {
  const { orderId = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [reloadCount, setReloadCount] = useState(0)
  const [result, setResult] = useState<OrderRequestResult | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState('')

  const requestKey = `${orderId}|${reloadCount}`
  const loading = result?.key !== requestKey
  const order = !loading ? result?.order : undefined
  const loadError = !loading ? result?.error : undefined
  const detailContext = resolveDetailContext(location.pathname, order, user?.id)
  const backLink =
    detailContext === 'admin'
      ? { to: '/admin?section=orders', label: '← Back to Orders' }
      : detailContext === 'tasks'
        ? { to: '/my-tasks', label: '← Back to My Tasks' }
        : detailContext === 'fulfil'
          ? { to: '/fulfil', label: '← Back to Fulfil Requests' }
          : { to: '/requests', label: '← Back to My Requests' }

  useEffect(() => {
    let ignore = false

    fetchOrderById(orderId)
      .then((data) => {
        if (!ignore) setResult({ key: requestKey, order: data })
      })
      .catch((error: unknown) => {
        if (ignore) return
        console.error(error)
        setResult({
          key: requestKey,
          error: error instanceof NotFoundError ? 'not-found' : 'failed',
        })
      })

    return () => {
      ignore = true
    }
  }, [orderId, requestKey])

  async function handleConfirmAction() {
    if (!order || !pendingAction) return

    setSubmitting(true)
    setActionError('')

    try {
      let updatedOrder: Order
      if (pendingAction === 'cancel') {
        updatedOrder = await cancelOrder(order.id)
      } else if (pendingAction === 'confirm') {
        updatedOrder = await confirmDelivery(order.id)
      } else if (pendingAction === 'accept') {
        await acceptOrder(order.id)
        setPendingAction(null)
        navigate('/my-tasks?tab=active', { replace: true })
        return
      } else if (pendingAction === 'pick-up') {
        updatedOrder = await markOrderPickedUp(order.id)
      } else {
        updatedOrder = await markOrderDelivered(order.id)
      }
      setResult({ key: requestKey, order: updatedOrder })
      setPendingAction(null)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Action failed. Please try again.')
      setPendingAction(null)
    } finally {
      setSubmitting(false)
    }
  }

  let content

  if (loading) {
    content = <OrderDetailsSkeleton />
  } else if (loadError === 'not-found') {
    content = (
      <Paper variant="outlined" sx={{ p: { xs: 3, md: 4 } }}>
        <Stack spacing={1}>
          <Typography component="h1" variant="h5">
            Request not found
          </Typography>
          <Typography color="text.secondary">
            This request does not exist or you do not have access to it.
          </Typography>
        </Stack>
      </Paper>
    )
  } else if (loadError || !order) {
    content = (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => setReloadCount((count) => count + 1)}>
            Retry
          </Button>
        }
      >
        This request could not be loaded.
      </Alert>
    )
  } else {
    const showCancel = detailContext === 'requester' && canRequesterCancel(order.status)
    const showConfirm =
      detailContext === 'requester' && canRequesterConfirmDelivery(order.status)
    const showAccept =
      detailContext === 'fulfil' &&
      canCourierAccept(order.status) &&
      !order.courierId &&
      order.requester.id !== user?.id
    const waitingForRequester =
      detailContext === 'tasks' && order.status === 'PICKED_UP'
    const showPickUp = detailContext === 'tasks' && canCourierMarkPickedUp(order.status)
    const showDeliver = detailContext === 'tasks' && canCourierMarkDelivered(order.status)
    const showReorder = detailContext === 'requester' && canReorder(order.status)
    const hasActions =
      showCancel || showConfirm || showAccept || showPickUp || showDeliver || showReorder

    content = (
      <Stack spacing={3}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
        >
          <Stack spacing={0.25}>
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
              {formatOrderId(order.id)}
            </Typography>
            <Typography component="h1" variant="h4" sx={{ overflowWrap: 'anywhere' }}>
              {order.itemDescription}
            </Typography>
          </Stack>
          <Box sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }}>
            <OrderStatusChip status={order.status} size="medium" />
          </Box>
        </Stack>

        <Paper
          variant="outlined"
          sx={{ p: { xs: 2, md: 3 }, boxShadow: '0 12px 32px rgba(23, 35, 45, 0.06)' }}
        >
          <Stack spacing={2}>
            <Typography component="h2" variant="h6" sx={{ fontWeight: 650 }}>
              Status
            </Typography>
            <Typography color="text.secondary">
              {orderStatusDisplay[order.status].description}
            </Typography>
            <OrderProgress order={order} />
          </Stack>
        </Paper>

        <Paper
          variant="outlined"
          sx={{ p: { xs: 2, md: 3 }, boxShadow: '0 12px 32px rgba(23, 35, 45, 0.06)' }}
        >
          <Stack spacing={2}>
            <Typography component="h2" variant="h6" sx={{ fontWeight: 650 }}>
              Request details
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: { xs: 1.5, sm: 2 },
              }}
            >
              <DetailField label="Pickup" value={formatPickupLocation(order.pickup)} />
              <DetailField label="Deliver to" value={order.deliveryLocation} />
              <DetailField label="Credits offered" value={`${order.creditAmount} credits`} />
              <DetailField
                label="Acceptance deadline"
                value={formatDateTime(order.acceptanceDeadline)}
              />
            </Box>

            <Divider />

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: { xs: 1.5, sm: 2 },
              }}
            >
              <DetailField label="Requester" value={formatParticipantName(order.requester)} />
              <DetailField
                label="Courier"
                value={
                  order.courier
                    ? formatParticipantName(order.courier)
                    : order.courierId
                      ? 'Assigned'
                      : 'Not assigned yet'
                }
              />
              <DetailField label="Created" value={formatDateTime(order.createdAt)} />
              {order.acceptedAt && (
                <DetailField label="Accepted" value={formatDateTime(order.acceptedAt)} />
              )}
              {order.pickedUpAt && (
                <DetailField label="Picked up" value={formatDateTime(order.pickedUpAt)} />
              )}
              {order.completedAt && (
                <DetailField label="Delivered" value={formatDateTime(order.completedAt)} />
              )}
              {order.updatedAt && (
                <DetailField label="Last updated" value={formatDateTime(order.updatedAt)} />
              )}
            </Box>
          </Stack>
        </Paper>

        {waitingForRequester && (
          <Alert severity="info">
            Picked up. Waiting for the requester to confirm delivery.
          </Alert>
        )}

        {hasActions && (
          <Paper
            variant="outlined"
            sx={{ p: { xs: 2, md: 3 }, boxShadow: '0 12px 32px rgba(23, 35, 45, 0.06)' }}
          >
            <Stack spacing={2}>
              <Typography component="h2" variant="h6" sx={{ fontWeight: 650 }}>
                Actions
              </Typography>
              {actionError && <Alert severity="error">{actionError}</Alert>}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                {showAccept && (
                  <Button
                    variant="contained"
                    color="secondary"
                    disabled={submitting}
                    onClick={() => setPendingAction('accept')}
                  >
                    Accept
                  </Button>
                )}
                {showPickUp && (
                  <Button
                    variant="contained"
                    color="secondary"
                    disabled={submitting}
                    onClick={() => setPendingAction('pick-up')}
                  >
                    Mark picked up
                  </Button>
                )}
                {showDeliver && (
                  <Button
                    variant="contained"
                    color="secondary"
                    disabled={submitting}
                    onClick={() => setPendingAction('deliver')}
                  >
                    Mark delivered
                  </Button>
                )}
                {showConfirm && (
                  <Button
                    variant="contained"
                    disabled={submitting}
                    onClick={() => setPendingAction('confirm')}
                  >
                    Confirm delivery
                  </Button>
                )}
                {showReorder && (
                  <Button component={Link} to={reorderPath(order)} variant="contained">
                    Reorder
                  </Button>
                )}
                {showCancel && (
                  <Button
                    variant="outlined"
                    color="error"
                    disabled={submitting}
                    onClick={() => setPendingAction('cancel')}
                  >
                    Cancel request
                  </Button>
                )}
              </Stack>
            </Stack>
          </Paper>
        )}

        <Dialog open={pendingAction !== null} onClose={() => setPendingAction(null)}>
          {pendingAction && (
            <>
              <DialogTitle>{actionCopy[pendingAction].title}</DialogTitle>
              <DialogContent>
                <DialogContentText>{actionCopy[pendingAction].body}</DialogContentText>
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setPendingAction(null)} disabled={submitting}>
                  Back
                </Button>
                <Button
                  variant="contained"
                  color={actionCopy[pendingAction].color}
                  onClick={() => void handleConfirmAction()}
                  disabled={submitting}
                >
                  {actionCopy[pendingAction].confirmLabel}
                </Button>
              </DialogActions>
            </>
          )}
        </Dialog>
      </Stack>
    )
  }

  return (
    <Container component="main" maxWidth="md" sx={{ py: { xs: 3, md: 6 } }}>
      <Stack spacing={2}>
        <BackLink to={backLink.to} label={backLink.label} />
        {content}
      </Stack>
    </Container>
  )
}

export default OrderDetailsPage
