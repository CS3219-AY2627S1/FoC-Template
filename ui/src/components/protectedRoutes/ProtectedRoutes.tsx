/*
AI Assistance Disclosure:
Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-09-19
Scope: Updated protected navigation for the shared profile experience
Author review: I reviewed correctness and edited the changes to fit the project

Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-09-21
Scope: Passed the authenticated session to protected pages
Author review: I reviewed correctness and edited the changes to fit the project
*/

import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { CampusErrandsAPIError } from '../../api/models'
import { useCampusErrandsAPI } from '../../api/useCampusErrandsAPI'
import { routes } from '../../routes'
import type { CurrentSession } from '../user/models'
import styles from './ProtectedRoutes.module.css'

type AuthenticationStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error'

const ProtectedRoutes = () => {
  const location = useLocation()
  const [status, setStatus] = useState<AuthenticationStatus>('loading')
  const [session, setSession] = useState<CurrentSession | null>(null)
  const [attempt, setAttempt] = useState(0)
  const api = useCampusErrandsAPI()

  useEffect(() => {
    const verify = async () => {
      try {
        const currentSession = await api.user.authentication.verify({ onUnauthenticated: () => {} })
        setSession(currentSession)
        setStatus('authenticated')
      } catch (error) {
        setStatus(error instanceof CampusErrandsAPIError && error.status === 401 ? 'unauthenticated' : 'error')
      }
    }

    void verify()
  }, [api.user.authentication, attempt])

  if (status === 'loading') return <p className={styles.status} role="status">Checking your session…</p>
  if (status === 'error') {
    return (
      <div className={styles.status} role="alert">
        <div className={styles.error}>
          <p>Unable to verify your session.</p>
          <button type="button" onClick={() => {
            setStatus('loading')
            setAttempt((value) => value + 1)
          }}>Try again</button>
        </div>
      </div>
    )
  }
  if (status === 'unauthenticated') {
    const returnTo = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to={routes.signIn} state={{ returnTo }} replace />
  }
  return session ? <Outlet context={session} /> : null
}

export default ProtectedRoutes
