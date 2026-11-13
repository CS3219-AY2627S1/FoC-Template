import { useEffect, useRef, useState } from 'react'
import { Button } from '@base-ui/react/button'
import { Link, useParams, useSearch } from '@tanstack/react-router'
import { getApiErrorCode } from '#/lib/httpErrors'
import { OrderDetails } from '../../components/OrderDetails/OrderDetails'
import { OrderTimeline } from '../../components/OrderTimeline/OrderTimeline'
import { DeliveryPhotos } from '../../components/DeliveryPhotos/DeliveryPhotos'
import { ErrandChat } from '../../components/ErrandChat/ErrandChat'
import { OrderStatusBadge } from '../../components/OrderStatusBadge/OrderStatusBadge'
import { OrderActions } from '../../components/OrderActions/OrderActions'
import { OrderDispute } from '../../components/OrderDispute/OrderDispute'
import {
  OrderFeedback,
  OrderNotice,
} from '../../components/OrderFeedback/OrderFeedback'
import { useOrder } from '../../hooks/useOrders'
import { useOrderActions } from '../../hooks/useOrderActions'
import { clearCreation } from '../../utils/creationRequest'
import { orderErrorMessage } from '../../utils/orderErrors'
import { canRequestAgain, shortOrderId } from '../../utils/orderFormat'
import styles from '../../styles/order.module.scss'

export const OrderDetailPage = () => {
  const { orderId } = useParams({
    from: '/authenticated/user/errands/$orderId',
  })
  const search = useSearch({ from: '/authenticated/user/errands/$orderId' })
  const query = useOrder(orderId)
  const { retry: creationRetry } = useOrderActions()
  const [actionError, setActionError] = useState<Error | null>(null)
  const lock = useRef(false)
  const order = query.data
  useEffect(() => {
    if (order && query.userId === order.requester.id && order.createRequestId)
      clearCreation(query.userId, order.createRequestId)
  }, [order, query.userId])
  const courier = order?.courier?.id === query.userId
  const title =
    order?.status === 'CREATING' || order?.status === 'CREATE_FAILED'
      ? 'Creation details'
      : courier && order?.status === 'ACCEPTED'
        ? `Collect from ${order.pickup.name}`
        : courier && order?.status === 'PICKED_UP'
          ? `Deliver to ${order.requester.name ?? 'Requester'}`
          : 'Errand details'
  const retry = async () => {
    if (!order || lock.current) return
    lock.current = true
    try {
      await creationRetry.mutateAsync(order.id)
    } catch {
      /* The original request remains retryable. */
    } finally {
      lock.current = false
    }
  }
  return (
    <div className={styles.page}>
      <Link
        to="/errands"
        search={{
          tab: search.tab,
          participation: search.participation,
          page: search.page,
          q: search.q,
        }}
        className={styles.back}
      >
        ← Back to My Errands
      </Link>
      <OrderFeedback
        error={query.error}
        loading={query.isPending}
        retry={() => void query.refetch()}
      />
      {actionError && (
        <OrderNotice
          tone={
            getApiErrorCode(actionError) === 'CREDIT_ACCOUNT_PENDING'
              ? 'warning'
              : 'error'
          }
          title={orderErrorMessage(actionError)}
        />
      )}
      {order && query.userId && !query.error && (
        <>
          {order.status === 'CREATING' && (
            <OrderNotice tone="warning" title="Creation is not confirmed">
              Refresh to check the status, or retry the original submission.
              Credits may already be reserved.
            </OrderNotice>
          )}
          {order.status === 'CREATE_FAILED' && (
            <OrderNotice tone="error" title="Not enough available credits">
              This request was not posted. No credits were reserved for this
              attempt.
            </OrderNotice>
          )}
          {search.posted && order.status === 'OPEN' && (
            <OrderNotice tone="success" title="Your errand is posted">
              {order.creditReward} credits are reserved. Your errand is now open
              for a Courier to accept.
            </OrderNotice>
          )}
          {order.status === 'CREATING' && creationRetry.error && (
            <OrderNotice tone="warning" title="Creation is still not confirmed">
              {orderErrorMessage(creationRetry.error)}
            </OrderNotice>
          )}
          <div className={styles.title}>
            <h1 className={styles.pageTitle}>{title}</h1>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className={styles.muted} title={`Errand ID ${order.id}`}>
            Errand #{shortOrderId(order.id)}
          </p>
          <OrderDispute
            key={`${query.userId}:${order.id}`}
            order={order}
            userId={query.userId}
          />
          <div className={styles.detailGrid}>
            <div className={styles.main}>
              <OrderDetails order={order} />
              <ErrandChat order={order} />
            </div>
            {/* the errand order progress */}
            <div className={styles.side}>
              <OrderTimeline order={order} />
              <DeliveryPhotos order={order} />
              {order.status === 'CREATING' &&
                order.requester.id === query.userId && (
                  <div className={styles.actions}>
                    <Button
                      className={styles.secondary}
                      onClick={() => void query.refetch()}
                    >
                      Refresh status
                    </Button>
                    <Button
                      className={styles.button}
                      disabled={creationRetry.isPending}
                      onClick={() => void retry()}
                    >
                      {creationRetry.isPending
                        ? 'Checking…'
                        : 'Retry original request'}
                    </Button>
                  </div>
                )}
              {canRequestAgain(order, query.userId) && (
                <div className={styles.actions}>
                  <Link
                    className={styles.button}
                    to="/errands/new"
                    search={{ from: order.id }}
                  >
                    {order.status === 'CREATE_FAILED'
                      ? 'Create a new request'
                      : 'Request again'}
                  </Link>
                </div>
              )}
              <OrderActions
                key={`${query.userId}:${order.id}`}
                order={order}
                userId={query.userId}
                onError={setActionError}
              />
              <Link to="/deliver" className={styles.back}>
                Browse other errands →
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
