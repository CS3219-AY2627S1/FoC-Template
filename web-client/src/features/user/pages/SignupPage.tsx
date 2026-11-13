import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useRegister } from '@/api/user/auth'
import { FormError } from '@/components/FormError'
import { SubmitButton } from '@/components/SubmitButton'
import { TextField } from '@/components/TextField'
import { fieldErrorsOf } from '@/lib/http'
import { AuthCard } from '../components/AuthCard'

export function SignupPage() {
  const [values, setValues] = useState({ fullName: '', email: '', username: '', password: '' })
  const register = useRegister()
  const navigate = useNavigate()
  const fieldErrors = fieldErrorsOf(register.error)

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    register.mutate(values, {
      // The code was sent to this address. It travels in the router state, never in the URL.
      onSuccess: (user) => navigate('/verify', { state: { email: user.email } }),
    })
  }

  return (
    <AuthCard
      title="Create account"
      footer={
        <>
          Already have an account? <Link to="/login">Log in</Link>
        </>
      }
    >
      <form noValidate onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
        <FormError error={register.error} fields={['fullName', 'email', 'username', 'password']} />
        <TextField
          label="Full name"
          name="fullName"
          autoComplete="name"
          value={values.fullName}
          onChange={(fullName) => setValues({ ...values, fullName })}
          errors={fieldErrors.fullName}
        />
        <TextField
          label="NUS email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          hint="We send a 6-digit code to it."
          value={values.email}
          onChange={(email) => setValues({ ...values, email })}
          errors={fieldErrors.email}
        />
        <TextField
          label="Username"
          name="username"
          autoComplete="username"
          hint="You can log in with it instead of your email."
          value={values.username}
          onChange={(username) => setValues({ ...values, username })}
          errors={fieldErrors.username}
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={values.password}
          onChange={(password) => setValues({ ...values, password })}
          errors={fieldErrors.password}
        />
        <SubmitButton pending={register.isPending} pendingLabel="Creating account…">
          Create account
        </SubmitButton>
      </form>
    </AuthCard>
  )
}
