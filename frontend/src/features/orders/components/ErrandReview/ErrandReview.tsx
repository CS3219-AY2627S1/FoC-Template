import { Button } from '@base-ui/react/button'
import type { CreateErrandValues } from '../../schemas/createErrand.schema'
import { expiryLabel } from '../../utils/orderFormat'
import details from '../../styles/orderDetails.module.scss'
import styles from '../../styles/order.module.scss'

export const ErrandReview = ({
  values,
  onEdit,
  onSubmit,
  pending,
  canEdit = true,
  submitLabel,
}: {
  values: CreateErrandValues
  onEdit: () => void
  onSubmit: () => void
  pending: boolean
  canEdit?: boolean
  submitLabel?: string
}) => (
  <section className={styles.panel}>
    <dl className={details.details}>
      <dt>Pickup location</dt>
      <dd>
        {values.pickup?.name}
        <small>{values.pickup?.address}</small>
      </dd>
      <dt>Deliver to</dt>
      <dd>{values.deliveryLocation}</dd>
      <dt>Item</dt>
      <dd>{values.description}</dd>
      <dt>Notes</dt>
      <dd>{values.notes || 'None'}</dd>
      <dt>Reward</dt>
      <dd>{values.creditReward} credits</dd>
      <dt>Expiry</dt>
      <dd>{expiryLabel(values.expiryMinutes)} after posting</dd>
    </dl>
    <p className={styles.muted}>
      {values.creditReward} credits will be reserved when your request is
      posted.
    </p>
    <div className={styles.actions}>
      <Button
        className={styles.secondary}
        disabled={pending || !canEdit}
        onClick={onEdit}
      >
        Back to edit
      </Button>
      <Button className={styles.button} disabled={pending} onClick={onSubmit}>
        {pending ? 'Posting…' : (submitLabel ?? 'Post request')}
      </Button>
    </div>
  </section>
)
