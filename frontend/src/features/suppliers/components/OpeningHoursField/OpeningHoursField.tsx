import { Controller, useWatch } from 'react-hook-form'
import { Button } from '@base-ui/react/button'
import { Input } from '@base-ui/react/input'
import { Switch } from '@base-ui/react/switch'
import { dayLabels } from '../../utils/openingHours'
import type {
  Control,
  FieldErrors,
  UseFormSetValue,
  UseFormTrigger,
} from 'react-hook-form'
import type { SupplierFormValues } from '../../schemas/supplier.schema'
import ui from '../../styles/supplier.module.scss'
import styles from './OpeningHoursField.module.scss'

type OpeningHoursFieldProps = {
  control: Control<SupplierFormValues>
  errors: FieldErrors<SupplierFormValues>
  setValue: UseFormSetValue<SupplierFormValues>
  trigger: UseFormTrigger<SupplierFormValues>
}

export const OpeningHoursField = ({
  control,
  errors,
  setValue,
  trigger,
}: OpeningHoursFieldProps) => {
  const hours = useWatch({ control, name: 'hours' })

  const copyFirstOpenDay = () => {
    const source = hours.find((day) => day.open)
    if (!source) return
    hours.forEach((day, index) => {
      if (!day.open) return
      setValue(`hours.${index}.opensAt`, source.opensAt, { shouldDirty: true })
      setValue(`hours.${index}.closesAt`, source.closesAt, {
        shouldDirty: true,
      })
    })
    void trigger('hours')
  }

  return (
    <div className={styles.field}>
      <div className={styles.header}>
        <span className={styles.hint}>
          A closing time earlier than the opening time means it closes after
          midnight.
        </span>
        <Button
          type="button"
          className={`${ui.button} ${ui.small}`}
          onClick={copyFirstOpenDay}
        >
          Copy first open day to all
        </Button>
      </div>

      <div className={styles.rows} role="group" aria-label="Opening hours">
        {hours.map((day, index) => {
          const dayErrors = errors.hours?.[index]
          const labelId = `supplier-hours-${day.dayOfWeek}`
          const overnight =
            day.open && day.closesAt !== '' && day.closesAt < day.opensAt
          return (
            <div
              key={day.dayOfWeek}
              className={styles.row}
              data-closed={!day.open || undefined}
            >
              <span id={labelId} className={styles.day}>
                {dayLabels[day.dayOfWeek]}
              </span>

              <Controller
                name={`hours.${index}.open`}
                control={control}
                rules={{ deps: ['hours'] }}
                render={({ field }) => (
                  <label className={styles.switchLabel}>
                    <Switch.Root
                      className={styles.switch}
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      aria-labelledby={labelId}
                    >
                      <Switch.Thumb className={styles.thumb} />
                    </Switch.Root>
                    {field.value ? 'Open' : 'Closed'}
                  </label>
                )}
              />

              {(['opensAt', 'closesAt'] as const).map((key) => (
                <Controller
                  key={key}
                  name={`hours.${index}.${key}`}
                  control={control}
                  render={({ field: { onChange, ...field } }) => (
                    <Input
                      {...field}
                      type="time"
                      disabled={!day.open}
                      aria-label={`${dayLabels[day.dayOfWeek]} ${key === 'opensAt' ? 'opens at' : 'closes at'}`}
                      aria-invalid={Boolean(dayErrors?.[key])}
                      className={`${ui.input} ${styles.time}`}
                      onValueChange={onChange}
                    />
                  )}
                />
              ))}

              <span className={styles.note}>
                {overnight && (
                  <span className={styles.overnight}>
                    Closes after midnight
                  </span>
                )}
                {(dayErrors?.opensAt ?? dayErrors?.closesAt) && (
                  <span className={styles.error} role="alert">
                    {dayErrors.opensAt?.message ?? dayErrors.closesAt?.message}
                  </span>
                )}
              </span>
            </div>
          )
        })}
      </div>

      {errors.hours?.root?.message && (
        <p className={styles.error} role="alert">
          {errors.hours.root.message}
        </p>
      )}
      {errors.hours?.message && (
        <p className={styles.error} role="alert">
          {errors.hours.message}
        </p>
      )}
    </div>
  )
}
