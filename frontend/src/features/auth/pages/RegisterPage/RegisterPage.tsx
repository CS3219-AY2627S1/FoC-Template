import { useRef } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'

import { useRegister } from '#/features/auth/hooks/useRegister'

import type { RegisterFormValues } from './schemas/register.schema'
import { RegisterForm } from './components/RegisterForm/RegisterForm'

import styles from '#/features/auth/styles/authPage.module.scss'

export const RegisterPage = () => {
  const navigate = useNavigate()
  const registration = useRegister()

  // Block duplicate submissions before Query's pending state renders.
  const submissionInProgress = useRef(false)

  const handleValidSubmit = (values: RegisterFormValues) => {
    if (submissionInProgress.current) return

    submissionInProgress.current = true

    const { name, email, password } = values
    registration.mutate(
      { name, email, password },
      {
        onSuccess: () => {
          void navigate({
            to: '/verify-email',
            search: { email },
            replace: true,
          })
        },
        onSettled: () => {
          submissionInProgress.current = false
        },
      },
    )
  }

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.title}>Create your account</h1>
      </header>
      <RegisterForm
        onValidSubmit={handleValidSubmit}
        isSubmitting={registration.isPending || registration.isSuccess}
        submitError={registration.errorMessage}
      />
      <p className={styles.footer}>
        Already have an account?{' '}
        <Link className={styles.link} to="/login">
          Log in
        </Link>
      </p>
    </>
  )
}
