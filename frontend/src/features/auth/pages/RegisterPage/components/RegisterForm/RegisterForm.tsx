import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Input } from '@base-ui/react/input'
import { Button } from '@base-ui/react/button'

import { registerSchema } from '../../schemas/register.schema'
import type { RegisterFormValues } from '../../schemas/register.schema'

import styles from '#/features/auth/styles/authForm.module.scss'

type RegisterFormProps = {
  onValidSubmit?: (values: RegisterFormValues) => void
  isSubmitting?: boolean
  submitError?: string
}

export const RegisterForm = ({
  onValidSubmit,
  isSubmitting = false,
  submitError,
}: RegisterFormProps) => {
  const {
    control,
    handleSubmit,
    trigger,
    formState: { errors, isSubmitted },
  } = useForm<RegisterFormValues>({
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
    resolver: zodResolver(registerSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    shouldFocusError: false,
  })

  return (
    <form
      className={styles.form}
      noValidate
      aria-busy={isSubmitting}
      onSubmit={(event) => {
        if (isSubmitting) {
          event.preventDefault()
          return
        }

        void handleSubmit((values) => onValidSubmit?.(values))(event)
      }}
    >
      <div className={styles.field}>
        <label htmlFor="register-name">Name</label>
        <Controller
          name="name"
          control={control}
          render={({ field: { onChange, ...field } }) => (
            <Input
              {...field}
              className={styles.input}
              id="register-name"
              disabled={isSubmitting}
              type="text"
              autoComplete="name"
              required
              onValueChange={onChange}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'register-name-error' : undefined}
            />
          )}
        />

        {errors.name && (
          <p id="register-name-error" className={styles.error} role="alert">
            {errors.name.message}
          </p>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="register-email">Email</label>
        <Controller
          name="email"
          control={control}
          render={({ field: { onChange, ...field } }) => (
            <Input
              {...field}
              className={styles.input}
              id="register-email"
              disabled={isSubmitting}
              type="email"
              autoComplete="username"
              required
              onValueChange={onChange}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={
                errors.email ? 'register-email-error' : undefined
              }
            />
          )}
        />

        {errors.email && (
          <p id="register-email-error" className={styles.error} role="alert">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="register-password">Password</label>
        <Controller
          name="password"
          control={control}
          render={({ field: { onChange, ...field } }) => (
            <Input
              {...field}
              className={styles.input}
              id="register-password"
              disabled={isSubmitting}
              type="password"
              autoComplete="new-password"
              required
              onValueChange={(value) => {
                onChange(value)

                // The mismatch error belongs to confirmation, not this field.
                if (isSubmitted) {
                  void trigger('confirmPassword')
                }
              }}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={
                errors.password ? 'register-password-error' : undefined
              }
            />
          )}
        />

        {errors.password && (
          <p id="register-password-error" className={styles.error} role="alert">
            {errors.password.message}
          </p>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="register-confirm-password">Confirm password</label>
        <Controller
          name="confirmPassword"
          control={control}
          render={({ field: { onChange, ...field } }) => (
            <Input
              {...field}
              className={styles.input}
              id="register-confirm-password"
              disabled={isSubmitting}
              type="password"
              autoComplete="new-password"
              required
              onValueChange={onChange}
              aria-invalid={Boolean(errors.confirmPassword)}
              aria-describedby={
                errors.confirmPassword
                  ? 'register-confirm-password-error'
                  : undefined
              }
            />
          )}
        />

        {errors.confirmPassword && (
          <p
            id="register-confirm-password-error"
            className={styles.error}
            role="alert"
          >
            {errors.confirmPassword.message}
          </p>
        )}
      </div>

      {submitError && (
        <p className={styles.error} role="alert">
          {submitError}
        </p>
      )}

      <Button className={styles.submit} type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Creating account…' : 'Create Account'}
      </Button>
    </form>
  )
}
