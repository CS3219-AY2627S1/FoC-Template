// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-29
// Scope: Generated initial implementation, decomposed App.tsx into separate components
// Author review: I validated correctness and edited for style.

import type { User } from '@relay/contracts'
import { IconButton, RelayList, RelayListItem } from '@relay/ui'
import { useState } from 'react'

export function AccountOverview({
  profile,
  onLoggedOut,
  onUpdateProfile,
  onChangePassword,
  onDeleteAccount,
  onManageAdmins,
}: {
  profile: User
  onLoggedOut: () => void
  onUpdateProfile: () => void
  onChangePassword: () => void
  onDeleteAccount: () => void
  onManageAdmins: () => void
}) {
  const [imageFailed, setImageFailed] = useState(false)
  return (
    <>
      <RelayList>
        <RelayListItem
          leading={
            <span className="relay-button-with-image-avatar">
              {profile.profilePictureUrl && !imageFailed ? (
                <img
                  src={profile.profilePictureUrl}
                  alt="User Profile Photo"
                  onError={() => setImageFailed(true)}
                />
              ) : (
                profile?.username?.trim().charAt(0).toUpperCase() || '?'
              )}
            </span>
          }
          title={profile.username}
          subtitle={profile.email}
          trailing={
            <IconButton label="Log out" scale={1.25} onClick={onLoggedOut}>
              <svg viewBox="0 0 24 24" height="20px" width="20px" fill="currentColor">
                <path d="M5,21q-0.83,0-1.41-0.59T3,19V5Q3,4.17 3.59,3.59T5,3h7V5H5V19h7v2H5Zm11-4l-1.38-1.45L17.18,13H9V11h8.18L14.63,8.45L16,7l5,5l-5,5Z" />
              </svg>
            </IconButton>
          }
        />
      </RelayList>
      <RelayList className="account-options-list">
        <RelayListItem title="Update profile" onClick={onUpdateProfile} />
        <RelayListItem title="Change password" onClick={onChangePassword} />
        <RelayListItem title="Delete account" onClick={onDeleteAccount} />
      </RelayList>
      {profile.role == 'super-admin' && (
        <RelayList className="account-options-list">
          <RelayListItem title="Manage admins" onClick={onManageAdmins} />
        </RelayList>
      )}
    </>
  )
}
