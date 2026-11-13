import { useMemo } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@base-ui/react/button'
import { PickupLocationPicker } from '#/features/suppliers/components/PickupLocationPicker/PickupLocationPicker'
import {
  createErrandSchema,
  EXPIRY_MINUTES,
} from '../../schemas/createErrand.schema'
import { ErrandAiChat } from '../ErrandAiChat/ErrandAiChat'
import { applyDraft } from '../../schemas/errandAi.schema'
import { expiryLabel } from '../../utils/orderFormat'
import type { CreateErrandValues } from '../../schemas/createErrand.schema'
import common from '../../styles/order.module.scss'
import styles from './ErrandForm.module.scss'

const rewardLimitMessage = (availableCredits: number) =>
  availableCredits < 1
    ? 'You have no credits available for a reward.'
    : `You can offer up to ${availableCredits} credits.`

export const ErrandForm = ({
  values,
  availableCredits = null,
  onReview,
}: {
  values: CreateErrandValues
  availableCredits?: number | null
  onReview: (values: CreateErrandValues) => void
}) => {
  const schema = useMemo(
    () =>
      availableCredits == null
        ? createErrandSchema
        : createErrandSchema.refine(
            (input) => input.creditReward <= availableCredits,
            {
              path: ['creditReward'],
              message: rewardLimitMessage(availableCredits),
            },
          ),
    [availableCredits],
  )
  const {
    register,
    control,
    handleSubmit,
    getValues,
    reset,
    formState: { errors },
  } = useForm<CreateErrandValues>({
    defaultValues: values,
    resolver: zodResolver(schema),
  })
  const reward = register('creditReward', { valueAsNumber: true })
  return (
    <>
      <form
        className={`${common.panel} ${styles.form}`}
        noValidate
        onSubmit={handleSubmit(onReview)}
      >
        <section className={styles.group}>
          <h2>Where</h2>
          <Controller
            control={control}
            name="pickup"
            render={({ field }) => (
              <PickupLocationPicker
                value={field.value}
                onChange={field.onChange}
                error={errors.pickup?.message}
              />
            )}
          />
          <div className={styles.field}>
            <label htmlFor="delivery">Delivery location *</label>
            <input
              id="delivery"
              className={common.input}
              placeholder="Building, floor and meeting point"
              {...register('deliveryLocation')}
              aria-invalid={!!errors.deliveryLocation}
              aria-describedby={
                errors.deliveryLocation ? 'delivery-error' : undefined
              }
            />
            {errors.deliveryLocation && (
              <small id="delivery-error" className={common.error}>
                {errors.deliveryLocation.message}
              </small>
            )}
          </div>
        </section>
        <section className={styles.group}>
          <h2>What to collect</h2>
          <div className={styles.field}>
            <label htmlFor="description">Item *</label>
            <textarea
              id="description"
              rows={3}
              className={common.input}
              placeholder="Coffee, a printed document, a packed meal"
              {...register('description')}
              aria-invalid={!!errors.description}
              aria-describedby={
                errors.description ? 'description-error' : undefined
              }
            />
            {errors.description && (
              <small id="description-error" className={common.error}>
                {errors.description.message}
              </small>
            )}
          </div>
          <div className={styles.field}>
            <label htmlFor="notes">Notes</label>
            <textarea
              id="notes"
              rows={3}
              className={common.input}
              placeholder="Order number, dietary notes, or where to meet"
              {...register('notes')}
              aria-invalid={!!errors.notes}
              aria-describedby={errors.notes ? 'notes-error' : undefined}
            />
            {errors.notes && (
              <small id="notes-error" className={common.error}>
                {errors.notes.message}
              </small>
            )}
          </div>
        </section>
        <section className={styles.group}>
          <h2>Reward</h2>
          <div className={styles.columns}>
            <div className={styles.field}>
              <label htmlFor="reward">Courier reward *</label>
              <input
                id="reward"
                type="number"
                min={1}
                max={availableCredits ?? undefined}
                step={1}
                className={common.input}
                {...reward}
                onChange={(event) => {
                  if (
                    availableCredits != null &&
                    event.target.value !== '' &&
                    event.target.valueAsNumber > availableCredits
                  ) {
                    event.target.value = String(Math.max(availableCredits, 0))
                  }
                  void reward.onChange(event)
                }}
                aria-invalid={!!errors.creditReward || availableCredits === 0}
                aria-describedby="reward-help"
              />
              <small
                id="reward-help"
                className={
                  errors.creditReward || availableCredits === 0
                    ? common.error
                    : common.muted
                }
              >
                {errors.creditReward?.message ??
                  (availableCredits == null
                    ? 'Enter a positive whole number of credits.'
                    : rewardLimitMessage(availableCredits))}
              </small>
            </div>
            <div className={styles.field}>
              <label htmlFor="expiry">Expiry duration *</label>
              <select
                id="expiry"
                className={common.select}
                {...register('expiryMinutes', { valueAsNumber: true })}
              >
                {EXPIRY_MINUTES.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {expiryLabel(minutes)}
                  </option>
                ))}
              </select>
              <small className={common.muted}>
                Unaccepted requests expire after this duration.
              </small>
            </div>
          </div>
        </section>
        <div className={`${common.actions} ${styles.actions}`}>
          <Button type="submit" className={common.button}>
            Continue
          </Button>
        </div>
      </form>
      <ErrandAiChat
        getValues={getValues}
        onApply={(draft) => reset(applyDraft(getValues(), draft))}
      />
    </>
  )
}
