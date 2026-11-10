import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CampusErrandsAPIError } from '../../../api/models'
import { useCampusErrandsAPI } from '../../../api/useCampusErrandsAPI'
import AuthLayout from '../../../components/authLayout/AuthLayout'
import { useToast } from '../../../components/toast/useToast'
import { routes } from '../../../routes'
import styles from '../Authentication.module.css'

const SignUp = () => {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const api = useCampusErrandsAPI()
  const navigate = useNavigate()
  const { showErrorToast, showSuccessToast } = useToast()

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsPending(true)

    try {
      await api.user.authentication.signUp({
        username: username.trim(),
        email: email.trim().toLowerCase(),
        password,
      })
      showSuccessToast('Account created. You can now sign in.')
      navigate(routes.signIn, { replace: true })
    } catch (requestError) {
      showErrorToast(requestError instanceof CampusErrandsAPIError ? requestError.message : 'Unable to create your account. Please try again.')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <AuthLayout eyebrow="Join the campus network" title="Create Account">
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            name="username"
            autoComplete="username"
            placeholder="e.g. jordan.k"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            disabled={isPending}
            required
          />
        </div>
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
              autoComplete="new-password"
              placeholder="Create a password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={isPending}
              minLength={8}
              maxLength={64}
              pattern="(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9]).{8,64}"
              title="Use 8–64 characters with at least one uppercase letter, one lowercase letter, and one digit."
              aria-describedby="password-hint"
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
          <p className={styles.hint} id="password-hint">Use 8–64 characters with at least one uppercase letter, one lowercase letter, and one digit.</p>
        </div>
        <p className={styles.welcomeCredits}>100 welcome credits are added automatically when you join.</p>
        <button className={styles.submit} type="submit" disabled={isPending}>
          {isPending ? 'Creating account…' : 'Create Account'}
        </button>
      </form>
      <p className={styles.footer}>
        Already have an account? <Link to={routes.signIn}>Sign in</Link>
      </p>
    </AuthLayout>
  )
}

export default SignUp
