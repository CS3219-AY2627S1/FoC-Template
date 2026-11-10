import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CampusErrandsAPIError } from '../../../api/models'
import { useCampusErrandsAPI } from '../../../api/useCampusErrandsAPI'
import AuthLayout from '../../../components/authLayout/AuthLayout'
import { routes } from '../../../routes'
import styles from '../Authentication.module.css'

type AuthenticationNavigationState = {
  returnTo?: string
}

const SignIn = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState('')
  const api = useCampusErrandsAPI()
  const location = useLocation()
  const navigate = useNavigate()
  const returnTo = (location.state as AuthenticationNavigationState | null)?.returnTo

  useEffect(() => {
    const verify = async () => {
      try {
        await api.user.authentication.verify({ onUnauthenticated: () => {} })
        navigate(returnTo ?? routes.home, { replace: true })
      } catch {
        return
      }
    }

    void verify()
  }, [api.user.authentication, navigate, returnTo])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsPending(true)
    setError('')

    try {
      await api.user.authentication.signIn({ email: email.trim().toLowerCase(), password })
      navigate(returnTo ?? routes.home, { replace: true })
    } catch (requestError) {
      setError(requestError instanceof CampusErrandsAPIError
        ? requestError.status === 401 ? 'The email or password is incorrect. Please try again.' : requestError.message
        : 'Unable to sign in. Please try again.')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <AuthLayout eyebrow="NUS student community" title="Sign In">
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@campus.edu"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isPending}
            required
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="password">Password</label>
          <div className={styles.passwordInput}>
            <input
              id="password"
              name="password"
              type={passwordVisible ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={isPending}
              required
            />
            <button
              className={styles.visibilityButton}
              type="button"
              onClick={() => setPasswordVisible((visible) => !visible)}
              disabled={isPending}
              aria-label={passwordVisible ? 'Hide password' : 'Show password'}
            >
              {passwordVisible ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button className={styles.submit} type="submit" disabled={isPending}>
          {isPending ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
      <p className={styles.footer}>
        New to Campus Errands? <Link to={routes.signUp}>Create an account</Link>
      </p>
    </AuthLayout>
  )
}

export default SignIn
