// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-29
// Scope: Generated initial implementation, decomposed App.tsx into separate components
// Author review: I validated correctness and edited for style.

import { authFetch } from '@relay/user-auth-frontend-fetch'
import '@relay/ui/styles.css'
import './App.css'
import { useEffect, useState } from 'react'
import { GlassCard, GlassWindow, IconButton, RelayBrand } from '@relay/ui'
import type { UserRemoteProps } from '@relay/contracts'
import { LoginForm } from '../user/LoginForm'
import { ProfileSetupForm } from '../components/account/ProfileSetupForm'
import { RegisterForm } from '../user/RegisterForm'
import { VerificationForm } from '../user/VerificationForm'
import { AccountPage } from '../user/AccountPage'
import { MapView } from '../components/MapView'

type View = 'login' | 'register' | 'verify' | 'profile' | 'account'

export default function App({
  fetchSession,
  authVersion = 0,
  navigateTo,
  closeProfile,
  refreshUserProfile,
  presentation = 'full',
}: UserRemoteProps) {
  const [view, setView] = useState<View>('login')
  const [restoringSession, setRestoringSession] = useState(Boolean(fetchSession))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginNotice, setLoginNotice] = useState('')
  const [verificationBackView, setVerificationBackView] = useState<'login' | 'register'>('login')

  useEffect(() => {
    if (!fetchSession) {
      setRestoringSession(false)
      return
    }

    let cancelled = false
    setRestoringSession(true)

    void fetchSession()
      .then((session) => {
        if (cancelled) return
        setView(session.userData.profileCreated ? 'account' : 'profile')
      })
      .catch(() => {
        if (!cancelled) setView('login')
      })
      .finally(() => {
        if (!cancelled) setRestoringSession(false)
      })

    return () => {
      cancelled = true
    }
  }, [authVersion])

  if (restoringSession) {
    return presentation === 'card' ? (
      <div className="user-profile-content">
        <div className="user-profile-card-header relay-card-header">
          <h1>Profile</h1>
          <IconButton label="Close profile" onClick={closeProfile}>
            ×
          </IconButton>
        </div>
        <p>Restoring your session…</p>
      </div>
    ) : (
      <main className="user-app-shell">Restoring your session…</main>
    )
  }

  const showAuthMap =
    view === 'login' || view === 'register' || view === 'verify' || view === 'profile'

  /* Verification */
  function startVerification(
    email: string,
    password: string,
    backView: 'login' | 'register' = 'login',
  ) {
    setEmail(email)
    setPassword(password)
    setVerificationBackView(backView)
    setView('verify')
  }

  async function finishVerification(profileCreated: boolean) {
    if (!profileCreated) {
      setView('profile')
      return
    }
    await refreshUserProfile?.()
    completeAuth()
  }

  /* Verification Completion */
  async function onLogin(
    email: string,
    password: string,
    emailVerified: boolean,
    profileCreated: boolean,
  ) {
    if (!emailVerified) startVerification(email, password)
    else {
      if (!profileCreated) {
        setView('profile')
        return
      }
      await refreshUserProfile?.()
      completeAuth()
    }
  }

  async function finishLogout() {
    await authFetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    await refreshUserProfile?.()
    setView('login')
    closeProfile?.()
    navigateTo?.('user')
  }

  function completeAuth() {
    if (presentation != 'card') navigateTo?.('supplier')
  }

  const userContent = (
    <div className="user-content-column">
      <RelayBrand />
      <section className={`user-panel${view === 'account' ? ' account-panel' : ''}`}>
        {view === 'register' && (
          <RegisterForm
            onRegistered={(email, password) => startVerification(email, password, 'register')}
            switchToLogin={() => setView('login')}
          />
        )}
        {view === 'verify' && (
          <VerificationForm
            email={email}
            password={password}
            onVerified={finishVerification}
            onBack={() => setView(verificationBackView)}
            backLabel={verificationBackView === 'login' ? 'Back to login' : 'Back to registration'}
          />
        )}
        {view === 'login' && (
          <LoginForm
            onLoggedIn={onLogin}
            switchToRegister={() => setView('register')}
            onVerificationRequired={(email, password) =>
              startVerification(email, password, 'login')
            }
            notice={loginNotice}
          />
        )}
        {view === 'profile' && (
          <ProfileSetupForm
            onComplete={async () => {
              await refreshUserProfile?.()
              completeAuth()
            }}
          />
        )}
        {view === 'account' && (
          <GlassCard className="account-glass-card">
            <AccountPage
              closeProfile={closeProfile}
              onLoggedOut={finishLogout}
              onUpdated={() => refreshUserProfile?.()}
              onDeleted={() => {
                setLoginNotice('Your account was deleted successfully.')
                setView('login')
                refreshUserProfile?.()
                closeProfile?.()
                navigateTo?.('user')
              }}
            />
          </GlassCard>
        )}
      </section>
      <p className="user-footer">Restricted to NUS Students and Staff (for now).</p>
    </div>
  )
  if (presentation === 'card') {
    return (
      <AccountPage
        closeProfile={closeProfile}
        onLoggedOut={finishLogout}
        onUpdated={() => refreshUserProfile?.()}
        onDeleted={() => {
          setLoginNotice('Your account was deleted successfully.')
          setView('login')
          refreshUserProfile?.()
          closeProfile?.()
          navigateTo?.('user')
        }}
      />
    )
  }

  return showAuthMap ? (
    <GlassWindow background={<MapView />} withGlow={view === 'login' || view === 'register'}>
      {userContent}
    </GlassWindow>
  ) : (
    <main className="user-app-shell">{userContent}</main>
  )
}
