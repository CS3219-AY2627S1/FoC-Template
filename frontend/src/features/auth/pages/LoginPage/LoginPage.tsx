import { Link, useNavigate } from '@tanstack/react-router'
import { useRef } from 'react'

import { useAuth } from '#/features/auth/providers/AuthProvider'
import { useLogin } from '#/features/auth/hooks/useLogin'
import { AuthRequestError } from '#/features/auth/lib/authRequest'
import { getHomePath } from '#/features/auth/utils/getHomePath'

import type { LoginFormValues } from './schemas/login.schema'
import { LoginForm } from './components/LoginForm/LoginForm'

import styles from '#/features/auth/styles/authPage.module.scss'

export const LoginPage = () => {
  const login = useLogin()
  const auth = useAuth()
  const navigate = useNavigate()

  // Acquire synchronously and retain the lock until successful navigation.
  const submissionInProgress = useRef(false)

  const handleValidSubmit = (values: LoginFormValues) => {
    if (submissionInProgress.current || login.isSuccess) return

    submissionInProgress.current = true
    login.mutate(values, {
      onSuccess: (tokens) => {
        auth.completeLogin(tokens.accessToken)
        void navigate({ to: getHomePath(), replace: true })
      },
      onError: () => {
        submissionInProgress.current = false
      },
    })
  }

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.title}>Welcome Back</h1>
      </header>
      <LoginForm
        onValidSubmit={handleValidSubmit}
        isSubmitting={login.isPending}
        isSuccess={login.isSuccess}
        submitError={login.errorMessage}
      />
      <p className={styles.footer}>
        <Link className={styles.link} to="/forgot-password">
          Forgot password?
        </Link>
      </p>
      {login.error instanceof AuthRequestError &&
        login.error.status === 403 && (
          <p className={styles.footer}>
            <Link
              className={styles.link}
              to="/verify-email"
              search={{ email: login.variables?.email }}
            >
              Resend verification email
            </Link>
          </p>
        )}
      <p className={styles.footer}>
        Don't have an account?{' '}
        <Link className={styles.link} to="/register">
          Sign up
        </Link>
      </p>
    </>
  )
}
