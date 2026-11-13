import { Button } from '@base-ui/react/button'
import { Input } from '@base-ui/react/input'
import { Controller } from 'react-hook-form'
import type { FormEvent } from 'react'
import { useUserEditForm } from '../../hooks/useUserEditForm'
import type { UserFormValues } from '../../../../schemas/user.schema'
import type { User } from '../../../../types/user.types'
import { UserAvatar } from '../../../../components/UserAvatar/UserAvatar'
import { formatUserDate } from '../../../../utils/formatUserDate'
import { DiscardChangesDialog } from '../DiscardChangesDialog/DiscardChangesDialog'
import { UserRolesField } from '../UserRolesField/UserRolesField'
import styles from './UserEditForm.module.scss'

type UserEditFormProps = {
  user: User
  faculties: string[]
  isSaving: boolean
  submitError?: string
  onSubmit: (values: UserFormValues) => Promise<void>
  onCancel: () => void
}

export const UserEditForm = ({
  user,
  faculties,
  isSaving,
  submitError,
  onSubmit,
  onCancel,
}: UserEditFormProps) => {
  const {
    control,
    handleSubmit,
    formState: { errors, isDirty, isSubmitting },
    isNavigationBlocked,
    handleDiscardDialogOpenChange,
    confirmDiscardChanges,
  } = useUserEditForm(user, faculties)
  const isBusy = isSubmitting || isSaving
  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    void handleSubmit(onSubmit)(event)
  }

  return (
    <form
      className={styles.form}
      noValidate
      aria-busy={isBusy}
      onSubmit={handleFormSubmit}
    >
      <div className={styles.formHeader}>
        <UserAvatar user={user} large />
        <div>
          <h2>{user.name}</h2>
          <p>{user.email}</p>
        </div>
      </div>
      <div className={styles.fieldGrid}>
        <div className={styles.field}>
          <label htmlFor="user-name">Name</label>
          <Controller
            name="name"
            control={control}
            render={({ field: { onChange, ...field } }) => (
              <Input
                {...field}
                id="user-name"
                className={styles.input}
                required
                maxLength={255}
                onValueChange={onChange}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? 'user-name-error' : undefined}
              />
            )}
          />
          {errors.name && (
            <p id="user-name-error" className={styles.fieldError} role="alert">
              {errors.name.message}
            </p>
          )}
        </div>

        <div className={styles.field}>
          <label htmlFor="user-email">Email</label>
          <Controller
            name="email"
            control={control}
            render={({ field: { onChange, ...field } }) => (
              <Input
                {...field}
                id="user-email"
                type="email"
                className={styles.input}
                required
                maxLength={320}
                onValueChange={onChange}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={
                  errors.email
                    ? 'user-email-hint user-email-error'
                    : 'user-email-hint'
                }
              />
            )}
          />
          <p id="user-email-hint">
            A new email address must be verified before it replaces the current
            one.
          </p>
          {errors.email && (
            <p id="user-email-error" className={styles.fieldError} role="alert">
              {errors.email.message}
            </p>
          )}
        </div>

        <div className={styles.fullWidth}>
          <UserRolesField
            control={control}
            errorMessage={errors.roles?.message}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="user-phone">Phone number</label>
          <Controller
            name="phoneNumber"
            control={control}
            render={({ field: { onChange, ...field } }) => (
              <Input
                {...field}
                id="user-phone"
                type="tel"
                className={styles.input}
                placeholder="+65 9123 5436"
                onValueChange={onChange}
                aria-invalid={Boolean(errors.phoneNumber)}
                aria-describedby={
                  errors.phoneNumber ? 'user-phone-error' : undefined
                }
              />
            )}
          />
          {errors.phoneNumber && (
            <p id="user-phone-error" className={styles.fieldError} role="alert">
              {errors.phoneNumber.message}
            </p>
          )}
        </div>

        <div className={styles.field}>
          <label htmlFor="user-faculty">Faculty</label>
          <Controller
            name="faculty"
            control={control}
            render={({ field }) => (
              <select
                {...field}
                id="user-faculty"
                className={styles.input}
                aria-invalid={Boolean(errors.faculty)}
                aria-describedby={
                  errors.faculty ? 'user-faculty-error' : undefined
                }
              >
                <option value="">No faculty</option>
                {faculties.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            )}
          />
          {errors.faculty && (
            <p
              id="user-faculty-error"
              className={styles.fieldError}
              role="alert"
            >
              {errors.faculty.message}
            </p>
          )}
        </div>
      </div>

      {submitError && (
        <p className={styles.error} role="alert">
          {submitError}
        </p>
      )}

      <dl className={styles.metadata}>
        <div>
          <dt>Created</dt>
          <dd>{formatUserDate(user.createdAt)}</dd>
        </div>
        <div>
          <dt>Last updated</dt>
          <dd>{formatUserDate(user.updatedAt)}</dd>
        </div>
      </dl>

      <div className={styles.actions}>
        <Button
          type="button"
          className={styles.button}
          disabled={isBusy}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className={`${styles.button} ${styles.primary}`}
          disabled={!isDirty || isBusy}
        >
          {isBusy && (
            <span className={styles.buttonSpinner} aria-hidden="true" />
          )}
          <span aria-live="polite">{isBusy ? 'Saving…' : 'Save changes'}</span>
        </Button>
      </div>

      <DiscardChangesDialog
        open={isNavigationBlocked}
        onOpenChange={handleDiscardDialogOpenChange}
        onConfirmDiscard={confirmDiscardChanges}
      />
    </form>
  )
}
