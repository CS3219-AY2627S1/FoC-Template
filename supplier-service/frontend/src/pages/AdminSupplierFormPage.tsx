import { useState, type FormEvent, type ReactNode } from 'react'
import {
  ArrowLeft,
  Clock3,
  Info,
  MapPinned,
  Plus,
  Save,
  Store,
  Upload,
} from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  SupplierMutationError,
  type CreateSupplierRequest,
  type SupplierStatus,
  type UpdateSupplierRequest,
  useCreateSupplierMutation,
  useRemoveSupplierImageMutation,
  useUploadSupplierImageMutation,
  useUpdateSupplierMutation,
} from '../api/adminSupplierApi'
import type { Supplier } from '../api/supplierQueries'
import {
  SupplierApiError,
  useSupplierDetailQuery,
} from '../api/supplierQueries'
import { Button } from '../components/DirectoryControls'
import { StatePanel } from '../components/DirectoryStates'
import styles from './AdminSupplierFormPage.module.css'

interface SupplierFormValues {
  name: string
  type: string
  building: string
  floor: string
  locationDescription: string
  latitude: string
  longitude: string
  openingTime: string
  closingTime: string
  imageUrl: string
  status: SupplierStatus
}

type ImageMode = 'NONE' | 'URL' | 'UPLOAD'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

type FieldErrors = Partial<Record<keyof SupplierFormValues, string>>

const emptyValues: SupplierFormValues = {
  name: '',
  type: '',
  building: '',
  floor: '',
  locationDescription: '',
  latitude: '',
  longitude: '',
  openingTime: '',
  closingTime: '',
  imageUrl: '',
  status: 'ACTIVE',
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function valuesFromSupplier(supplier: Supplier): SupplierFormValues {
  return {
    name: supplier.name ?? '',
    type: supplier.type ?? '',
    building: supplier.building ?? '',
    floor: supplier.floor ?? '',
    locationDescription: supplier.locationDescription ?? '',
    latitude: String(supplier.latitude ?? ''),
    longitude: String(supplier.longitude ?? ''),
    openingTime: supplier.openingTime?.slice(0, 5) ?? '',
    closingTime: supplier.closingTime?.slice(0, 5) ?? '',
    imageUrl: supplier.imageUrl ?? '',
    status: supplier.status ?? 'ACTIVE',
  }
}

function validate(
  values: SupplierFormValues,
  imageMode: ImageMode,
  imageFile: File | null,
  existingImageSource?: Supplier['imageSource'],
) {
  const errors: FieldErrors = {}
  const requiredText = [
    ['name', 'Name', 255],
    ['type', 'Category', 100],
    ['building', 'Building', 255],
  ] as const

  for (const [field, label, limit] of requiredText) {
    const value = values[field].trim()
    if (!value) errors[field] = `${label} is required.`
    else if (value.length > limit)
      errors[field] = `${label} must be ${limit} characters or fewer.`
  }
  if (values.floor.trim().length > 20) {
    errors.floor = 'Floor must be 20 characters or fewer.'
  }

  const latitude = Number(values.latitude)
  if (!values.latitude.trim()) errors.latitude = 'Latitude is required.'
  else if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    errors.latitude = 'Latitude must be between -90 and 90.'
  }

  const longitude = Number(values.longitude)
  if (!values.longitude.trim()) errors.longitude = 'Longitude is required.'
  else if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    errors.longitude = 'Longitude must be between -180 and 180.'
  }

  const imageUrl = values.imageUrl.trim()
  if (imageMode === 'URL' && !imageUrl) {
    errors.imageUrl = 'Enter an image URL or choose another image option.'
  } else if (imageMode === 'URL' && imageUrl) {
    try {
      const parsed = new URL(imageUrl)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        errors.imageUrl = 'Image URL must begin with http:// or https://.'
      }
    } catch {
      errors.imageUrl = 'Enter a valid absolute image URL.'
    }
  }
  if (
    imageMode === 'UPLOAD' &&
    !imageFile &&
    existingImageSource !== 'UPLOAD'
  ) {
    errors.imageUrl = 'Choose a JPEG, PNG, or WebP image to upload.'
  }
  if (imageFile && !ACCEPTED_IMAGE_TYPES.includes(imageFile.type)) {
    errors.imageUrl = 'Choose a JPEG, PNG, or WebP image.'
  } else if (imageFile && imageFile.size > MAX_IMAGE_SIZE) {
    errors.imageUrl = 'Image must be 5 MB or smaller.'
  }
  return errors
}

function normalizedDetails(values: SupplierFormValues, imageMode: ImageMode) {
  const nullable = (value: string) => value.trim() || null
  return {
    name: values.name.trim(),
    type: values.type.trim(),
    building: values.building.trim(),
    floor: nullable(values.floor),
    locationDescription: nullable(values.locationDescription),
    latitude: Number(values.latitude),
    longitude: Number(values.longitude),
    openingTime: nullable(values.openingTime),
    closingTime: nullable(values.closingTime),
    imageUrl: imageMode === 'URL' ? nullable(values.imageUrl) : null,
  }
}

function imageModeFromSupplier(supplier: Supplier): ImageMode {
  if (supplier.imageSource === 'UPLOAD') return 'UPLOAD'
  if (supplier.imageSource === 'EXTERNAL_URL') return 'URL'
  return 'NONE'
}

function serverFieldErrors(error: SupplierMutationError) {
  const mapped: FieldErrors = {}
  for (const [field, messages] of Object.entries(error.fieldErrors ?? {})) {
    if (field in emptyValues && messages?.length) {
      mapped[field as keyof SupplierFormValues] = messages.join(' ')
    }
  }
  return mapped
}

export function CreateSupplierPage() {
  const navigate = useNavigate()
  const mutation = useCreateSupplierMutation()
  const uploadMutation = useUploadSupplierImageMutation()
  const [values, setValues] = useState(emptyValues)
  const [imageMode, setImageMode] = useState<ImageMode>('NONE')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submissionError, setSubmissionError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (mutation.isPending || uploadMutation.isPending) return
    const validationErrors = validate(values, imageMode, imageFile)
    setErrors(validationErrors)
    setSubmissionError('')
    if (Object.keys(validationErrors).length) return

    const request: CreateSupplierRequest = {
      ...normalizedDetails(values, imageMode),
      status: values.status,
    }
    try {
      const created = await mutation.mutateAsync(request)
      if (imageMode === 'UPLOAD' && imageFile) {
        try {
          await uploadMutation.mutateAsync({
            id: created.id!,
            version: created.version!,
            file: imageFile,
          })
        } catch {
          navigate('/admin/suppliers', {
            replace: true,
            state: {
              notice: `${created.name} was created, but its photo could not be uploaded. Edit the location to retry.`,
            },
          })
          return
        }
      }
      navigate('/admin/suppliers', {
        replace: true,
        state: { notice: `${created.name} was created successfully.` },
      })
    } catch (error) {
      if (error instanceof SupplierMutationError) {
        setErrors(serverFieldErrors(error))
        setSubmissionError(error.message)
      } else {
        setSubmissionError('We couldn’t add this location. Please try again.')
      }
    }
  }

  return (
    <SupplierFormLayout
      errors={errors}
      imageFile={imageFile}
      imageMode={imageMode}
      mode="create"
      onChange={(field, value) => {
        setValues((current) => ({ ...current, [field]: value }))
        setErrors((current) => ({ ...current, [field]: undefined }))
      }}
      onSubmit={submit}
      onImageFileChange={setImageFile}
      onImageModeChange={(mode) => {
        setImageMode(mode)
        setErrors((current) => ({ ...current, imageUrl: undefined }))
      }}
      pending={mutation.isPending || uploadMutation.isPending}
      submissionError={submissionError}
      values={values}
    />
  )
}

export function EditSupplierPage() {
  const { id } = useParams()
  const validId = Boolean(id && uuidPattern.test(id))
  const supplierQuery = useSupplierDetailQuery(id, validId)

  if (!validId) {
    return (
      <StatePanel
        message="This link doesn’t look right."
        title="Location not found"
        tone="error"
      />
    )
  }
  if (supplierQuery.isPending) {
    return <p aria-live="polite">Loading supplier details…</p>
  }
  if (supplierQuery.isError || !supplierQuery.data) {
    return (
      <StatePanel
        actionLabel="Try again"
        message={
          supplierQuery.error instanceof SupplierApiError &&
          supplierQuery.error.status === 404
            ? 'This supplier may have been deleted.'
            : 'Please try again.'
        }
        onAction={() => void supplierQuery.refetch()}
        title={
          supplierQuery.error instanceof SupplierApiError &&
          supplierQuery.error.status === 404
            ? 'Supplier not found'
            : 'We couldn’t load this location'
        }
        tone="error"
      />
    )
  }

  return (
    <LoadedEditSupplierPage
      key={`${supplierQuery.data.id}-${supplierQuery.data.version}`}
      onRefetch={() => supplierQuery.refetch()}
      supplier={supplierQuery.data}
    />
  )
}

function LoadedEditSupplierPage({
  supplier,
  onRefetch,
}: {
  supplier: Supplier
  onRefetch: () => ReturnType<
    ReturnType<typeof useSupplierDetailQuery>['refetch']
  >
}) {
  const navigate = useNavigate()
  const mutation = useUpdateSupplierMutation()
  const uploadMutation = useUploadSupplierImageMutation()
  const removeImageMutation = useRemoveSupplierImageMutation()
  const [values, setValues] = useState(() => valuesFromSupplier(supplier))
  const [imageMode, setImageMode] = useState<ImageMode>(() =>
    imageModeFromSupplier(supplier),
  )
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submissionError, setSubmissionError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (
      mutation.isPending ||
      uploadMutation.isPending ||
      removeImageMutation.isPending
    )
      return
    const validationErrors = validate(
      values,
      imageMode,
      imageFile,
      supplier.imageSource,
    )
    setErrors(validationErrors)
    setSubmissionError('')
    if (Object.keys(validationErrors).length) return

    const request: UpdateSupplierRequest = {
      ...normalizedDetails(values, imageMode),
      version: supplier.version!,
    }
    try {
      const updated = await mutation.mutateAsync({ id: supplier.id!, request })
      try {
        if (imageMode === 'UPLOAD' && imageFile) {
          await uploadMutation.mutateAsync({
            id: updated.id!,
            version: updated.version!,
            file: imageFile,
          })
        } else if (imageMode === 'NONE' && supplier.imageSource) {
          await removeImageMutation.mutateAsync({
            id: updated.id!,
            version: updated.version!,
          })
        }
      } catch {
        navigate('/admin/suppliers', {
          replace: true,
          state: {
            notice: `${updated.name} was updated, but its photo change could not be completed. Edit the location to retry.`,
          },
        })
        return
      }
      navigate('/admin/suppliers', {
        replace: true,
        state: { notice: `${updated.name} was updated successfully.` },
      })
    } catch (error) {
      if (error instanceof SupplierMutationError) {
        setErrors(serverFieldErrors(error))
        setSubmissionError(
          error.status === 409
            ? 'Someone else just changed this location. Reload to see the latest.'
            : error.message,
        )
      } else {
        setSubmissionError('We couldn’t save your changes. Please try again.')
      }
    }
  }

  const reloadLatest = async () => {
    mutation.reset()
    setSubmissionError('')
    const result = await onRefetch()
    if (result.data) {
      setValues(valuesFromSupplier(result.data))
      setImageMode(imageModeFromSupplier(result.data))
      setImageFile(null)
      setErrors({})
    }
  }

  return (
    <SupplierFormLayout
      errors={errors}
      imageFile={imageFile}
      imageMode={imageMode}
      mode="edit"
      onChange={(field, value) => {
        setValues((current) => ({ ...current, [field]: value }))
        setErrors((current) => ({ ...current, [field]: undefined }))
      }}
      onReload={submissionError.includes('changed') ? reloadLatest : undefined}
      onImageFileChange={setImageFile}
      onImageModeChange={(mode) => {
        setImageMode(mode)
        setImageFile(null)
        if (mode === 'URL' && supplier.imageSource === 'UPLOAD') {
          setValues((current) => ({ ...current, imageUrl: '' }))
        }
        setErrors((current) => ({ ...current, imageUrl: undefined }))
      }}
      onSubmit={submit}
      pending={
        mutation.isPending ||
        uploadMutation.isPending ||
        removeImageMutation.isPending
      }
      submissionError={submissionError}
      supplier={supplier}
      values={values}
    />
  )
}

interface SupplierFormLayoutProps {
  mode: 'create' | 'edit'
  values: SupplierFormValues
  imageMode: ImageMode
  imageFile: File | null
  errors: FieldErrors
  pending: boolean
  submissionError: string
  supplier?: Supplier
  onChange: (field: keyof SupplierFormValues, value: string) => void
  onImageModeChange: (mode: ImageMode) => void
  onImageFileChange: (file: File | null) => void
  onSubmit: (event: FormEvent) => void
  onReload?: () => void
}

function SupplierFormLayout({
  mode,
  values,
  imageMode,
  imageFile,
  errors,
  pending,
  submissionError,
  supplier,
  onChange,
  onImageModeChange,
  onImageFileChange,
  onSubmit,
  onReload,
}: SupplierFormLayoutProps) {
  const create = mode === 'create'
  return (
    <section aria-labelledby="supplier-form-heading" className={styles.page}>
      <Link className={styles.backLink} to="/admin/suppliers">
        <ArrowLeft aria-hidden="true" />
        Back to suppliers
      </Link>
      <header className={styles.heading}>
        <span className={styles.headingIcon} aria-hidden="true">
          <Store />
        </span>
        <div>
          <p className={styles.eyebrow}>Supplier administration</p>
          <h1 id="supplier-form-heading">
            {create ? 'Add campus location' : `Edit ${supplier?.name}`}
          </h1>
          <p>
            {create
              ? 'Add a place students can pick up from or deliver to.'
              : 'Change its status from the location list.'}
          </p>
        </div>
      </header>

      {submissionError && (
        <div className={styles.formError} role="alert">
          <strong>Your changes weren’t saved.</strong>
          <p>{submissionError}</p>
          {onReload && (
            <Button onClick={onReload} variant="secondary">
              Reload latest version
            </Button>
          )}
        </div>
      )}

      <form className={styles.form} noValidate onSubmit={onSubmit}>
        <fieldset>
          <legend>
            <Store aria-hidden="true" />
            Supplier details
          </legend>
          <div className={styles.grid}>
            <FormField error={errors.name} id="supplier-name" label="Name">
              <input
                aria-describedby={
                  errors.name ? 'supplier-name-error' : undefined
                }
                aria-invalid={Boolean(errors.name)}
                id="supplier-name"
                maxLength={255}
                onChange={(event) => onChange('name', event.target.value)}
                required
                value={values.name}
              />
            </FormField>
            <FormField
              error={errors.type}
              id="supplier-type-form"
              label="Category"
            >
              <input
                aria-describedby={
                  errors.type ? 'supplier-type-form-error' : undefined
                }
                aria-invalid={Boolean(errors.type)}
                id="supplier-type-form"
                maxLength={100}
                onChange={(event) => onChange('type', event.target.value)}
                required
                value={values.type}
              />
            </FormField>
            {create && (
              <FormField
                error={errors.status}
                id="supplier-status-form"
                label="Initial status"
              >
                <select
                  aria-describedby={
                    errors.status ? 'supplier-status-form-error' : undefined
                  }
                  aria-invalid={Boolean(errors.status)}
                  id="supplier-status-form"
                  onChange={(event) => onChange('status', event.target.value)}
                  value={values.status}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </FormField>
            )}
            {!create && (
              <div className={styles.readOnlyField}>
                <span>Status</span>
                <strong>
                  {supplier?.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                </strong>
                <small>Change status from the supplier list.</small>
              </div>
            )}
            <FormField
              error={errors.building}
              id="supplier-building-form"
              label="Building"
            >
              <input
                aria-describedby={
                  errors.building ? 'supplier-building-form-error' : undefined
                }
                aria-invalid={Boolean(errors.building)}
                id="supplier-building-form"
                maxLength={255}
                onChange={(event) => onChange('building', event.target.value)}
                required
                value={values.building}
              />
            </FormField>
            <FormField error={errors.floor} id="supplier-floor" label="Floor">
              <input
                aria-describedby={
                  errors.floor ? 'supplier-floor-error' : undefined
                }
                aria-invalid={Boolean(errors.floor)}
                id="supplier-floor"
                maxLength={20}
                onChange={(event) => onChange('floor', event.target.value)}
                placeholder="For example, B1 or 1M"
                value={values.floor}
              />
            </FormField>
            <div className={styles.fullWidth}>
              <FormField
                error={errors.locationDescription}
                id="supplier-directions"
                label="Location description / directions"
              >
                <textarea
                  aria-describedby={
                    errors.locationDescription
                      ? 'supplier-directions-error'
                      : undefined
                  }
                  aria-invalid={Boolean(errors.locationDescription)}
                  id="supplier-directions"
                  onChange={(event) =>
                    onChange('locationDescription', event.target.value)
                  }
                  rows={4}
                  value={values.locationDescription}
                />
              </FormField>
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>
            <MapPinned aria-hidden="true" />
            Map coordinates
          </legend>
          <p className={styles.fieldsetHelp}>
            Decimal degrees. Latitude is −90 to 90; longitude is −180 to 180.
          </p>
          <div className={styles.grid}>
            <FormField
              error={errors.latitude}
              id="supplier-latitude"
              label="Latitude"
            >
              <input
                aria-describedby={
                  errors.latitude ? 'supplier-latitude-error' : undefined
                }
                aria-invalid={Boolean(errors.latitude)}
                id="supplier-latitude"
                inputMode="decimal"
                onChange={(event) => onChange('latitude', event.target.value)}
                required
                value={values.latitude}
              />
            </FormField>
            <FormField
              error={errors.longitude}
              id="supplier-longitude"
              label="Longitude"
            >
              <input
                aria-describedby={
                  errors.longitude ? 'supplier-longitude-error' : undefined
                }
                aria-invalid={Boolean(errors.longitude)}
                id="supplier-longitude"
                inputMode="decimal"
                onChange={(event) => onChange('longitude', event.target.value)}
                required
                value={values.longitude}
              />
            </FormField>
          </div>
        </fieldset>

        <fieldset>
          <legend>
            <Clock3 aria-hidden="true" />
            Hours and image
          </legend>
          <div className={styles.grid}>
            <FormField
              error={errors.openingTime}
              id="supplier-opening-time"
              label="Opening time"
            >
              <input
                aria-describedby={
                  errors.openingTime ? 'supplier-opening-time-error' : undefined
                }
                aria-invalid={Boolean(errors.openingTime)}
                id="supplier-opening-time"
                onChange={(event) =>
                  onChange('openingTime', event.target.value)
                }
                type="time"
                value={values.openingTime}
              />
            </FormField>
            <FormField
              error={errors.closingTime}
              id="supplier-closing-time"
              label="Closing time"
            >
              <input
                aria-describedby={
                  errors.closingTime ? 'supplier-closing-time-error' : undefined
                }
                aria-invalid={Boolean(errors.closingTime)}
                id="supplier-closing-time"
                onChange={(event) =>
                  onChange('closingTime', event.target.value)
                }
                type="time"
                value={values.closingTime}
              />
            </FormField>
            <div className={styles.fullWidth}>
              <div className={styles.imageField}>
                <span className={styles.imageLabel}>Location photo</span>
                <div
                  aria-label="Choose location photo source"
                  className={styles.imageOptions}
                  role="radiogroup"
                >
                  {(
                    [
                      ['NONE', 'No photo'],
                      ['URL', 'Use image URL'],
                      ['UPLOAD', 'Upload from device'],
                    ] as const
                  ).map(([mode, label]) => (
                    <label className={styles.imageOption} key={mode}>
                      <input
                        checked={imageMode === mode}
                        name="supplier-image-mode"
                        onChange={() => onImageModeChange(mode)}
                        type="radio"
                        value={mode}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>

                {imageMode === 'URL' && (
                  <FormField
                    error={errors.imageUrl}
                    id="supplier-image-url"
                    label="Image URL"
                  >
                    <input
                      aria-describedby={
                        errors.imageUrl
                          ? 'supplier-image-url-error'
                          : 'supplier-image-url-help'
                      }
                      aria-invalid={Boolean(errors.imageUrl)}
                      id="supplier-image-url"
                      onChange={(event) =>
                        onChange('imageUrl', event.target.value)
                      }
                      placeholder="https://example.com/location.jpg"
                      type="url"
                      value={values.imageUrl}
                    />
                    <small id="supplier-image-url-help">
                      Use a direct HTTPS image address that you are allowed to
                      display.
                    </small>
                  </FormField>
                )}

                {imageMode === 'UPLOAD' && (
                  <FormField
                    error={errors.imageUrl}
                    id="supplier-image-file"
                    label={
                      supplier?.imageSource === 'UPLOAD'
                        ? 'Replace uploaded image'
                        : 'Choose image file'
                    }
                  >
                    <div className={styles.filePicker}>
                      <Upload aria-hidden="true" />
                      <input
                        accept={ACCEPTED_IMAGE_TYPES.join(',')}
                        aria-describedby={
                          errors.imageUrl
                            ? 'supplier-image-file-error'
                            : 'supplier-image-file-help'
                        }
                        aria-invalid={Boolean(errors.imageUrl)}
                        id="supplier-image-file"
                        onChange={(event) =>
                          onImageFileChange(event.target.files?.[0] ?? null)
                        }
                        type="file"
                      />
                    </div>
                    <small id="supplier-image-file-help">
                      JPEG, PNG or WebP, up to 5 MB.
                      {supplier?.imageSource === 'UPLOAD' && !imageFile
                        ? ' The current uploaded photo will be kept.'
                        : ''}
                    </small>
                    {imageFile && (
                      <span className={styles.selectedFile} aria-live="polite">
                        Selected: {imageFile.name}
                      </span>
                    )}
                    {!create && supplier?.imageUrl && (
                      <img
                        alt={`${supplier.name} current location`}
                        className={styles.imagePreview}
                        onError={(event) => {
                          event.currentTarget.hidden = true
                        }}
                        src={supplier.imageUrl}
                      />
                    )}
                  </FormField>
                )}

                {imageMode === 'NONE' && (
                  <p className={styles.imageHelp}>
                    The branded “Photo not available” illustration will be shown
                    on the public detail page.
                  </p>
                )}
              </div>
            </div>
          </div>
        </fieldset>

        {!create && supplier && (
          <aside className={styles.recordInfo}>
            <strong>
              <Info aria-hidden="true" />
              Record information
            </strong>
            <span>ID: {supplier.id}</span>
            <span>Version: {supplier.version}</span>
            <span>Created: {supplier.createdAt}</span>
          </aside>
        )}

        <div className={styles.actions}>
          <Link to="/admin/suppliers">Cancel</Link>
          <Button disabled={pending} type="submit">
            {create ? <Plus aria-hidden="true" /> : <Save aria-hidden="true" />}
            {pending ? 'Saving…' : create ? 'Create supplier' : 'Save changes'}
          </Button>
        </div>
      </form>
    </section>
  )
}

function FormField({
  id,
  label,
  error,
  children,
}: {
  id: string
  label: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error && (
        <span className={styles.fieldError} id={`${id}-error`} role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
