import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@base-ui/react/button'
import { Input } from '@base-ui/react/input'
import { Select } from '@base-ui/react/select'
import { supplierSchema } from '../../schemas/supplier.schema'
import { SUPPLIER_CATEGORIES } from '../../types/supplier.types'
import { categoryLabels } from '../../utils/supplierFormat'
import { OpeningHoursField } from '../OpeningHoursField/OpeningHoursField'
import { SupplierImageField } from '../SupplierImageField/SupplierImageField'
import { SupplierPreviewCard } from '../SupplierPreviewCard/SupplierPreviewCard'
import type { Control, FieldErrors } from 'react-hook-form'
import type { SupplierFormValues } from '../../schemas/supplier.schema'
import type { SupplierImageChange } from '../../types/supplier.types'
import ui from '../../styles/supplier.module.scss'
import styles from './SupplierForm.module.scss'

type SupplierFormProps = {
  defaultValues: SupplierFormValues
  submitLabel: string
  submitting?: boolean
  currentImageUrl?: string | null
  onSubmit: (values: SupplierFormValues, image: SupplierImageChange) => void
  onCancel: () => void
}

type TextFieldName = Exclude<keyof SupplierFormValues, 'category' | 'hours'>

type TextFieldProps = {
  name: TextFieldName
  label: string
  control: Control<SupplierFormValues>
  errors: FieldErrors<SupplierFormValues>
  required?: boolean
  type?: 'text' | 'time'
  placeholder?: string
  hint?: string
}

const TextField = ({
  name,
  label,
  control,
  errors,
  required = false,
  type = 'text',
  placeholder,
  hint,
}: TextFieldProps) => {
  const id = `supplier-${name}`
  const error = errors[name]?.message
  const describedBy =
    [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ') ||
    undefined

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required && <span className={styles.required}> *</span>}
      </label>
      <Controller
        name={name}
        control={control}
        render={({ field: { onChange, ...field } }) => (
          <Input
            {...field}
            id={id}
            type={type}
            placeholder={placeholder}
            className={ui.input}
            onValueChange={onChange}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
          />
        )}
      />
      {hint && (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

const categoryItems = SUPPLIER_CATEGORIES.map((value) => ({
  value,
  label: categoryLabels[value],
}))

export const SupplierForm = ({
  defaultValues,
  submitLabel,
  submitting = false,
  currentImageUrl = null,
  onSubmit,
  onCancel,
}: SupplierFormProps) => {
  const [imageChange, setImageChange] = useState<SupplierImageChange>({
    type: 'keep',
  })
  // A local preview URL for a newly chosen file, released when it changes.
  const selectedImageUrl = useMemo(
    () =>
      imageChange.type === 'upload'
        ? URL.createObjectURL(imageChange.file)
        : null,
    [imageChange],
  )
  useEffect(
    () => () => {
      if (selectedImageUrl) URL.revokeObjectURL(selectedImageUrl)
    },
    [selectedImageUrl],
  )
  const previewImageUrl =
    imageChange.type === 'remove' ? null : (selectedImageUrl ?? currentImageUrl)

  const {
    control,
    handleSubmit,
    setValue,
    trigger,
    formState: { errors },
  } = useForm<SupplierFormValues>({
    defaultValues,
    resolver: zodResolver(supplierSchema),
  })
  const fieldProps = { control, errors }
  const values = useWatch({ control })

  return (
    <div className={styles.layout}>
      <form
        className={`${ui.card} ${styles.form}`}
        noValidate
        onSubmit={handleSubmit((submitted) => onSubmit(submitted, imageChange))}
      >
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Basic information</h2>
          <TextField
            {...fieldProps}
            name="name"
            label="Name"
            placeholder="eg. CoffeeBean @ COM3"
            required
          />

          <div className={styles.field}>
            <Controller
              name="category"
              control={control}
              render={({ field }) => (
                <Select.Root
                  items={categoryItems}
                  value={field.value}
                  onValueChange={(value) => value && field.onChange(value)}
                >
                  <Select.Label className={styles.label}>
                    Category<span className={styles.required}> *</span>
                  </Select.Label>
                  <Select.Trigger
                    className={`${ui.input} ${styles.selectTrigger}`}
                  >
                    <Select.Value />
                    <Select.Icon className={styles.selectIcon}>▾</Select.Icon>
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Positioner
                      sideOffset={4}
                      className={styles.positioner}
                    >
                      <Select.Popup className={styles.selectPopup}>
                        <Select.List>
                          {categoryItems.map(({ value, label }) => (
                            <Select.Item
                              key={value}
                              value={value}
                              className={styles.selectItem}
                            >
                              <Select.ItemText>{label}</Select.ItemText>
                              <Select.ItemIndicator>✓</Select.ItemIndicator>
                            </Select.Item>
                          ))}
                        </Select.List>
                      </Select.Popup>
                    </Select.Positioner>
                  </Select.Portal>
                </Select.Root>
              )}
            />
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Location</h2>
          <div className={styles.row}>
            <TextField
              {...fieldProps}
              name="building"
              label="Building"
              placeholder="eg. COM3"
              required
            />
            <TextField
              {...fieldProps}
              name="floor"
              label="Floor"
              placeholder="eg. 1"
            />
          </div>

          <TextField
            {...fieldProps}
            name="locationDescription"
            label="Location description"
            placeholder="eg. Next to LT19"
          />

          <div className={styles.row}>
            <TextField
              {...fieldProps}
              name="latitude"
              label="Latitude"
              placeholder="eg. 1.2948"
            />
            <TextField
              {...fieldProps}
              name="longitude"
              label="Longitude"
              placeholder="eg. 103.7736"
            />
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Opening hours</h2>
          <OpeningHoursField
            control={control}
            errors={errors}
            setValue={setValue}
            trigger={trigger}
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Image</h2>
          <SupplierImageField
            previewUrl={previewImageUrl}
            hasSavedImage={Boolean(currentImageUrl)}
            onChange={setImageChange}
          />
        </section>

        <div className={styles.actions}>
          <Button
            type="button"
            className={ui.button}
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className={`${ui.button} ${ui.primary}`}
            disabled={submitting}
          >
            {submitting ? 'Saving…' : submitLabel}
          </Button>
        </div>
      </form>

      <aside className={styles.preview} aria-label="Preview">
        <p className={styles.previewLabel}>Preview</p>
        <SupplierPreviewCard values={values} imageUrl={previewImageUrl} />
        <p className={styles.previewHint}>
          This is how students will see the supplier.
        </p>
      </aside>
    </div>
  )
}
