/*
AI Assistance Disclosure:
Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-09-19
Scope: Integrated current-profile loading and shared account state
Author review: I reviewed correctness and edited the changes to fit the project

Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-09-21
Scope: Passed shared authentication session state into the user provider
Author review: I reviewed correctness and edited the changes to fit the project
*/

import { useEffect, useState } from 'react'
import { Outlet, useOutletContext } from 'react-router-dom'
import { useCampusErrandsAPI } from '../../api/useCampusErrandsAPI'
import AppHeader from '../appHeader/AppHeader'
import type { CurrentSession, CurrentUserProfile } from '../user/models'
import { UserProvider } from '../user/UserProvider'
import styles from './ProtectedLayout.module.css'

type ProfileStatus = 'loading' | 'ready' | 'error'

const ProtectedLayout = () => {
  const session = useOutletContext<CurrentSession>()
  const api = useCampusErrandsAPI()
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null)
  const [status, setStatus] = useState<ProfileStatus>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const currentProfile = await api.user.authentication.getCurrentUser()
        setProfile(currentProfile)
        setStatus('ready')
      } catch {
        setStatus('error')
      }
    }

    void loadProfile()
  }, [api.user.authentication, attempt])

  if (status === 'loading') {
    return <p className={styles.status} role="status">Loading your profile…</p>
  }

  if (status === 'error' || !profile) {
    return (
      <div className={styles.status} role="alert">
        <div className={styles.error}>
          <p>Unable to load your profile.</p>
          <button type="button" onClick={() => {
            setStatus('loading')
            setAttempt((value) => value + 1)
          }}>Try again</button>
        </div>
      </div>
    )
  }

  return (
    <UserProvider initialProfile={profile} session={session}>
      <div className={styles.layout}>
        <AppHeader />
        <Outlet />
      </div>
    </UserProvider>
  )
}

export default ProtectedLayout
