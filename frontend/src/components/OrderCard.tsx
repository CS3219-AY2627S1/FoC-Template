/**
 * AI Assistance Disclosure
 * Tool: Cursor (GPT-5.6 Sol Medium)
 * Scope: Assisted with frontend implementation, debugging and UI refinement.
 * Author review: The generated code was reviewed, tested, and iteratively refined by the author through follow-up instructions.
 */

import { Box, Button, Paper, Stack, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import {
  formatOrderId,
  formatParticipantName,
  canReorder,
  formatPickupLocation,
  getCourierAction,
  type CourierAction,
  reorderPath,
  type Order,
} from '../orders/orderTypes'
import OrderStatusChip from './OrderStatusChip'

function OrderField({ label, value }: { label: string; value: string }) {
  return (
    <Stack spacing={0.25}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 500, overflowWrap: 'anywhere' }}>
        {value}
      </Typography>
    </Stack>
  )
}

const courierActionLabel: Record<CourierAction, string> = {
  accept: 'Accept',
  'pick-up': 'Mark picked up',
  deliver: 'Mark delivered',
}

type OrderCardProps = {
  order: Order
  /** Requester cards link to /requests/:id; courier task cards to /my-tasks/:id. */
  variant?: 'requester' | 'courier'
  /** Override the details link, e.g. available requests open under /fulfil/:id. */
  detailsTo?: string
  actionPending?: boolean
  onCourierAction?: (order: Order, action: CourierAction) => void
}

function OrderCard({
  order,
  variant = 'requester',
  detailsTo,
  actionPending = false,
  onCourierAction,
}: OrderCardProps) {
  const isCourier = variant === 'courier'
  const detailsHref =
    detailsTo ?? (isCourier ? `/my-tasks/${order.id}` : `/requests/${order.id}`)
  const courierAction = isCourier ? getCourierAction(order.status) : null

  return (
    <Paper
      variant="outlined"
      component="article"
      sx={{
        p: { xs: 2, md: 2.5 },
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        height: '100%',
        boxShadow: '0 8px 24px rgba(23, 35, 45, 0.05)',
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}
      >
        <Stack spacing={0.25} sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
            {formatOrderId(order.id)}
          </Typography>
          <Typography variant="subtitle1" sx={{ fontWeight: 650, overflowWrap: 'anywhere' }}>
            {order.itemDescription}
          </Typography>
        </Stack>
        <OrderStatusChip status={order.status} />
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
          gap: 1.5,
        }}
      >
        <OrderField label="Pickup" value={formatPickupLocation(order.pickup)} />
        <OrderField label="Deliver to" value={order.deliveryLocation} />
        <OrderField
          label={isCourier ? 'Reward' : 'Credits'}
          value={`${order.creditAmount} credits`}
        />
        {isCourier ? (
          <OrderField label="Requester" value={formatParticipantName(order.requester)} />
        ) : (
          <OrderField
            label="Courier"
            value={
              order.courier
                ? formatParticipantName(order.courier)
                : order.courierId
                  ? 'Assigned'
                  : 'Not assigned yet'
            }
          />
        )}
      </Box>

      {isCourier && order.status === 'PICKED_UP' && (
        <Typography variant="body2" color="text.secondary">
          Waiting for the requester to confirm delivery.
        </Typography>
      )}

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        sx={{ mt: 'auto', alignItems: { sm: 'center' } }}
      >
        <Button component={Link} to={detailsHref} variant="outlined" size="small">
          View details
        </Button>
        {!isCourier && canReorder(order.status) && (
          <Button component={Link} to={reorderPath(order)} variant="contained" size="small">
            Reorder
          </Button>
        )}
        {courierAction && onCourierAction && (
          <Button
            variant="contained"
            size="small"
            color="secondary"
            disabled={actionPending}
            onClick={() => onCourierAction(order, courierAction)}
          >
            {courierActionLabel[courierAction]}
          </Button>
        )}
      </Stack>
    </Paper>
  )
}

export default OrderCard
