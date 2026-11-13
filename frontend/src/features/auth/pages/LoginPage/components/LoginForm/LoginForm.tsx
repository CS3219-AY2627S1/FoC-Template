import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Input } from '@base-ui/react/input'
import { Button } from '@base-ui/react/button'

import { loginSchema } from '../../schemas/login.schema'
import type { LoginFormValues } from '../../schemas/login.schema'

import styles from '#/features/auth/styles/authForm.module.scss'

type LoginFormProps = {
  onValidSubmit?: (values: LoginFormValues) => void
  isSubmitting?: boolean
  isSuccess?: boolean
  submitError?: string
}

export const LoginForm = ({
  onValidSubmit,
  isSubmitting = false,
  isSuccess = false,
  submitError,
}: LoginFormProps) => {
  const disabled = isSubmitting || isSuccess

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    defaultValues: { email: '', password: '' },
    resolver: zodResolver(loginSchema),
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
        if (disabled) {
          event.preventDefault()
          return
        }

        void handleSubmit((values) => onValidSubmit?.(values))(event)
      }}
    >
      <div className={styles.field}>
        <label htmlFor="login-email">Email</label>
        <Controller
          name="email"
          control={control}
          render={({ field: { onChange, ...field } }) => (
            <Input
              {...field}
              className={styles.input}
              id="login-email"
              disabled={disabled}
              type="email"
              autoComplete="username"
              required
              onValueChange={onChange}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'login-email-error' : undefined}
            />
          )}
        />

        {errors.email && (
          <p id="login-email-error" className={styles.error} role="alert">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="login-password">Password</label>
        <Controller
          name="password"
          control={control}
          render={({ field: { onChange, ...field } }) => (
            <Input
              {...field}
              className={styles.input}
              id="login-password"
              disabled={disabled}
              type="password"
              autoComplete="current-password"
              required
              onValueChange={onChange}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={
                errors.password ? 'login-password-error' : undefined
              }
            />
          )}
        />

        {errors.password && (
          <p id="login-password-error" className={styles.error} role="alert">
            {errors.password.message}
          </p>
        )}
      </div>

      {submitError && (
        <p className={styles.error} role="alert">
          {submitError}
        </p>
      )}

      <Button className={styles.submit} type="submit" disabled={disabled}>
        {isSubmitting ? 'Logging in…' : 'Log In'}
      </Button>
    </form>
  )
}
