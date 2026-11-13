// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-29
// Scope: Generated initial implementation, decomposed App.tsx into separate components
// Author review: I validated correctness and edited for style.

import { authFetch } from '@relay/user-auth-frontend-fetch'
import { useEffect, useState } from 'react'
import type { ApiResult, GetUserResponse, User } from '@relay/contracts'
import { BackButton, CloseButton, ErrorMessage } from '@relay/ui'
import { DeleteAccountForm } from '../components/account/DeleteAccountForm'
import { ProfileSetupForm } from '../components/account/ProfileSetupForm'
import { ChangePasswordForm } from '../components/account/ChangePasswordForm'
import { AccountOverview } from '../components/account/AccountOverview'
import { UpdateProfileForm } from '../components/account/UpdateProfileForm'
import { ManageAdminsView } from '../components/account/ManageAdminsView'

type Page = 'account' | 'change-password' | 'update-profile' | 'delete-account' | 'manage-admins'

export function AccountPage({
  closeProfile,
  onLoggedOut,
  onDeleted,
  onUpdated,
}: {
  closeProfile?: () => void
  onLoggedOut: () => void
  onDeleted: () => void
  onUpdated?: () => void
}) {
  const [page, setPage] = useState<Page>('account')
  const [profile, setProfile] = useState<User | null>(null)
  const [error, setError] = useState('')
  const [needsSetup, setNeedsSetup] = useState(false)

  async function loadProfile() {
    try {
      const response = (await authFetch('/api/user/me', { credentials: 'include' }).then((result) =>
        result.json(),
      )) as ApiResult<GetUserResponse>
      if (response.ok) {
        setProfile(response.data)
        setNeedsSetup(false)
        setError('')
        return
      }
      const profileMissing = response.error.code === 'PROFILE_NOT_FOUND'
      setNeedsSetup(profileMissing)
      setError(profileMissing ? '' : response.error.message)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load your profile.')
    }
  }

  useEffect(() => {
    void loadProfile()
  }, [])

  async function logout() {
    try {
      const response = await authFetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Unable to log out.')
      onLoggedOut()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to log out.')
    }
  }

  return (
    <div className="account-view relay-design-system">
      <ErrorMessage message={error} />
      {needsSetup && (
        <ProfileSetupForm
          onComplete={() => {
            setNeedsSetup(false)
            loadProfile()
          }}
        />
      )}
      {profile && (
        <>
          <header className="account-header relay-card-header">
            {page != 'account' && <BackButton onClick={() => setPage('account')} />}
            <h1>{page.replace(/-/g, ' ').replace(/^./, char => char.toUpperCase())}</h1>
            <CloseButton label="Close profile" onClick={closeProfile} />
          </header>
          {page == 'account' && (
            <AccountOverview
              profile={profile}
              onLoggedOut={() => logout()}
              onUpdateProfile={() => setPage('update-profile')}
              onChangePassword={() => setPage('change-password')}
              onDeleteAccount={() => setPage('delete-account')}
              onManageAdmins={() => setPage('manage-admins')}
            />
          )}
          {page == 'update-profile' && (
            <UpdateProfileForm
              profile={profile}
              onUpdated={(updatedProfile) => {
                setProfile(updatedProfile)
                onUpdated?.()
                setPage('account')
              }}
            />
          )}
          {page == 'change-password' && (
            <ChangePasswordForm onLoggedOut={onLoggedOut} />
          )}
          {page == 'delete-account' && (
            <DeleteAccountForm
              username={profile.username}
              onDeleted={onDeleted}
            />
          )}
          {page == 'manage-admins' && (
            <ManageAdminsView />
          )}
        </>
      )}
    </div>
  )
}
