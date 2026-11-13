import { useRef, useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { isCancel } from 'axios'
import { Button } from '@base-ui/react/button'
import { getApiErrorCode } from '#/lib/httpErrors'
import { useSession } from '#/features/auth/hooks/useSession'
import { useCreditBalance } from '#/features/credits/hooks/useCreditBalance'
import { getCurrentUserId } from '#/features/auth/lib/accessTokenStore'
import { ErrandForm } from '../../components/ErrandForm/ErrandForm'
import { ErrandReview } from '../../components/ErrandReview/ErrandReview'
import {
  OrderFeedback,
  OrderNotice,
} from '../../components/OrderFeedback/OrderFeedback'
import { useOrderActions } from '../../hooks/useOrderActions'
import { useMyErrands, useOrder } from '../../hooks/useOrders'
import { usePickupLocations } from '#/features/suppliers/hooks/usePickupLocations'
import { findSameActiveRequest, reorderValues } from '../../utils/reorder'
import { formatOrderTime } from '../../utils/orderFormat'
import {
  clearCreation,
  loadCreation,
  newCreation,
  saveCreation,
} from '../../utils/creationRequest'
import {
  definiteCreationRejection,
  creationErrorOrderId,
  orderErrorMessage,
  orderErrorReason,
} from '../../utils/orderErrors'
import type { PendingCreation } from '../../utils/creationRequest'
import type { Errand } from '../../types/errand.types'
import type { CreateErrandValues } from '../../schemas/createErrand.schema'
import styles from '../../styles/order.module.scss'
import pageStyles from './CreateErrandPage.module.scss'

type KnownOrder = { id: string; posted: boolean }
type ReturnTo = 'map' | 'request' | 'locations'

// repost errand info
type CopiedErrand = { from: Errand; values: CreateErrandValues }

const isReturnTo = (value: string | undefined): value is ReturnTo =>
  value === 'map' || value === 'request' || value === 'locations'

export const CreateErrandPage = () => {
  const { userId } = useSession()
  const { from } = useSearch({ from: '/authenticated/user/errands/new' })
  if (!userId) return <OrderFeedback loading />
  const reorderId = from && !isReturnTo(from) ? from : undefined
  return reorderId ? (
    <CopiedCreationForm
      key={`${userId}:${reorderId}`}
      userId={userId}
      id={reorderId}
    />
  ) : (
    <CreationForm key={userId} userId={userId} />
  )
}
// load past errand, allow adjust the info for the form
const CopiedCreationForm = ({ userId, id }: { userId: string; id: string }) => {
  const past = useOrder(id)
  const locations = usePickupLocations(true)
  // unconfirmed submission need be resolve before request repost
  if (loadCreation(userId)) return <CreationForm userId={userId} />
  if (past.isPending || locations.isPending) return <OrderFeedback loading />
  if (!past.data || past.data.requester.id !== userId)
    return <CreationForm userId={userId} />
  return (
    <CreationForm
      userId={userId}
      copied={{
        from: past.data,
        values: reorderValues(past.data, locations.data ?? []),
      }}
    />
  )
}
const CreationForm = ({
  userId,
  copied,
}: {
  userId: string
  copied?: CopiedErrand
}) => {
  const {
    supplier: supplierId,
    from,
    category,
  } = useSearch({
    from: '/authenticated/user/errands/new',
  })
  const returnTo = isReturnTo(from) ? from : undefined
  const pickups = usePickupLocations(Boolean(supplierId))
  const [original, setOriginal] = useState<PendingCreation | null>(() =>
    loadCreation(userId),
  )
  const preset =
    supplierId && !original
      ? (pickups.data?.find((location) => location.id === supplierId) ?? null)
      : null
  const [values, setValues] = useState<CreateErrandValues>(
    () =>
      original?.values ??
      copied?.values ?? {
        pickup: null,
        deliveryLocation: '',
        description: '',
        notes: '',
        creditReward: 5,
        expiryMinutes: 60,
      },
  )
  const [review, setReview] = useState(!!original)
  const [unknown, setUnknown] = useState(!!original)
  const [failed, setFailed] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [knownOrder, setKnownOrder] = useState<KnownOrder | null>(null)
  const formValues: CreateErrandValues =
    values.pickup || !preset ? values : { ...values, pickup: preset }
  const waitingForPickup =
    Boolean(supplierId) && !original && !formValues.pickup && pickups.isPending
  const balance = useCreditBalance(userId)
  const availableCredits = balance.isSuccess
    ? balance.data.availableBalance
    : null
  const cappedValues: CreateErrandValues =
    availableCredits != null &&
    availableCredits >= 1 &&
    formValues.creditReward > availableCredits
      ? { ...formValues, creditReward: availableCredits }
      : formValues
  const { create } = useOrderActions()
  const active = useMyErrands({
    as: 'requester',
    view: 'active',
    page: 0,
    size: 100,
  })
  const sameRequest =
    review && !knownOrder && !unknown && !failed
      ? findSameActiveRequest(values, active.data?.items ?? [])
      : undefined
  const retryFailureReason = orderErrorReason(create.error)
  const navigate = useNavigate()
  const lock = useRef(false)
  const openOrder = async (destination: KnownOrder) => {
    if (userId !== getCurrentUserId()) return
    setLocalError(null)
    await navigate({
      to: '/errands/$orderId',
      params: { orderId: destination.id },
      search: {
        posted: destination.posted,
        tab: 'active',
        participation: 'requested',
        page: 0,
      },
    }).catch(() =>
      setLocalError(
        'The order page could not open. Find this errand in My Errands.',
      ),
    )
  }
  const submit = async () => {
    if (lock.current || knownOrder || userId !== getCurrentUserId()) return
    lock.current = true
    const pending = original ?? newCreation(userId, values)
    setLocalError(null)
    setFailed(false)
    if (!saveCreation(pending)) {
      setLocalError(
        'Unable to save this submission. Allow browser storage and try again.',
      )
      lock.current = false
      return
    }
    setOriginal(pending)
    let destination: KnownOrder | undefined
    try {
      const result = await create.mutateAsync(pending.input)
      if (userId !== getCurrentUserId()) return
      clearCreation(userId, pending.input.createRequestId)
      setOriginal(null)
      setUnknown(false)
      if (result.status === 'CREATE_FAILED') {
        setFailed(true)
      } else {
        destination = { id: result.errandId, posted: result.status === 'OPEN' }
      }
    } catch (error) {
      if (isCancel(error) || userId !== getCurrentUserId()) return
      const id = creationErrorOrderId(error)
      if (id) {
        clearCreation(userId, pending.input.createRequestId)
        setOriginal(null)
        setUnknown(false)
        destination = { id, posted: false }
      } else if (definiteCreationRejection(error) && !unknown) {
        clearCreation(userId, pending.input.createRequestId)
        setOriginal(null)
        setUnknown(false)
      } else setUnknown(true)
    } finally {
      lock.current = false
    }
    if (destination) {
      setKnownOrder(destination)
      await openOrder(destination)
    }
  }
  return (
    <div className={styles.page}>
      {returnTo === 'map' ? (
        <Link to="/map" className={styles.back}>
          ← Back to map
        </Link>
      ) : returnTo === 'request' ? (
        <Link to="/request" search={{ category }} className={styles.back}>
          ← Back to Find a supplier
        </Link>
      ) : returnTo === 'locations' && category ? (
        <Link to="/locations" search={{ category }} className={styles.back}>
          ← Back to locations
        </Link>
      ) : (
        <Link to="/home" className={styles.back}>
          ← Back to home
        </Link>
      )}
      {localError ? (
        <OrderNotice tone="error" title={localError} />
      ) : failed ? (
        <OrderNotice tone="error" title="Not enough available credits">
          This request was not posted. No credits were reserved for this
          attempt.
        </OrderNotice>
      ) : unknown ? (
        <OrderNotice tone="warning" title="Creation is not confirmed">
          Credits may already be reserved. Retry the original request to check
          and continue it.
          {retryFailureReason && (
            <>
              <br />
              Last attempt failed: {retryFailureReason}
            </>
          )}
        </OrderNotice>
      ) : create.error ? (
        <OrderNotice
          tone={
            getApiErrorCode(create.error) === 'CREDIT_ACCOUNT_PENDING'
              ? 'warning'
              : 'error'
          }
          title={orderErrorMessage(create.error)}
        />
      ) : null}
      {copied && !original && !knownOrder && (
        <OrderNotice
          tone="success"
          title={`Copied from your request on ${formatOrderTime(copied.from.createdAt)}`}
        >
          {copied.values.pickup
            ? 'Check the details, including any order number in the notes, then post it again.'
            : `${copied.from.pickup.name} is no longer available. Choose another pickup location.`}
        </OrderNotice>
      )}
      {sameRequest && (
        <OrderNotice
          tone="warning"
          title="You already have the same request in progress"
        >
          It was posted {formatOrderTime(sameRequest.createdAt)}. Post another
          one anyway?
        </OrderNotice>
      )}
      <h1 className={styles.pageTitle}>
        {knownOrder
          ? 'View your errand'
          : review
            ? 'Review request'
            : 'Create an errand'}
      </h1>
      <div className={pageStyles.layout}>
        <div className={pageStyles.main}>
          {knownOrder ? (
            <div className={styles.actions}>
              <Button
                className={styles.button}
                onClick={() => void openOrder(knownOrder)}
              >
                Open order
              </Button>
              <Link
                to="/errands"
                search={{ tab: 'active', participation: 'requested', page: 0 }}
                className={styles.secondary}
              >
                Go to My Errands
              </Link>
            </div>
          ) : review ? (
            <ErrandReview
              values={values}
              pending={create.isPending}
              canEdit={!unknown}
              onEdit={() => {
                create.reset()
                setFailed(false)
                setLocalError(null)
                setReview(false)
                setOriginal(null)
                clearCreation(userId)
              }}
              onSubmit={() => void submit()}
              submitLabel={
                unknown
                  ? 'Retry original request'
                  : failed
                    ? 'Try a new request'
                    : sameRequest
                      ? 'Post another request'
                      : undefined
              }
            />
          ) : waitingForPickup || balance.isPending ? (
            <p className={styles.muted} role="status">
              {waitingForPickup
                ? 'Loading pickup location…'
                : 'Loading your credits…'}
            </p>
          ) : (
            <ErrandForm
              values={cappedValues}
              availableCredits={availableCredits}
              onReview={(data) => {
                setValues(data)
                setReview(true)
              }}
            />
          )}
        </div>
        {!knownOrder && (
          <aside className={pageStyles.guide} aria-label="What you get">
            <section className={styles.panel}>
              <h2>What you get</h2>
              <ol className={pageStyles.steps}>
                <li>
                  <strong>Brought to you</strong>
                  <span>They meet you where you asked.</span>
                </li>
                <li>
                  <strong>You see who is coming</strong>
                  <span>Their name shows once someone takes it.</span>
                </li>
                <li>
                  <strong>You pay after it arrives</strong>
                  <span>If nobody takes it, your credits come back.</span>
                </li>
              </ol>
            </section>
          </aside>
        )}
      </div>
      {failed && (
        <Link
          to="/errands"
          search={{ tab: 'history', participation: 'requested', page: 0 }}
          className={styles.back}
        >
          View creation attempts in My Errands
        </Link>
      )}
    </div>
  )
}
