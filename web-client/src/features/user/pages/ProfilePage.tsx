import { useEffect, useRef, useState } from 'react'
import { KeyRound, UserPen } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router'
import { useCurrentUser } from '@/api/user/session'
import { Notice } from '@/components/Notice'
import { Page } from '@/components/Page'
import { LogoutButton } from '../components/LogoutButton'
import { ProfileLink } from '../components/ProfileLink'
import { ProfileSummary } from '../components/ProfileSummary'

export function ProfilePage() {
  const user = useCurrentUser()
  const location = useLocation()
  const navigate = useNavigate()
  // The edit pages come back here with what they saved. Kept in state, so it outlives the cleanup below.
  const [arrival] = useState(() => location.state as { notice?: string; detail?: string } | null)
  const notice = arrival?.notice
  const noticeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!notice) return
    // The button that saved is gone, so keyboard users continue from the notice, not the top of the page.
    noticeRef.current?.focus()
    // The browser keeps router state across a reload and back, so it is cleared once read.
    // Otherwise "Profile saved" would show again on every reload.
    navigate(location.pathname, { replace: true, state: null })
  }, [notice, navigate, location.pathname])

  return (
    <Page title="Profile">
      {notice && (
        <div ref={noticeRef} tabIndex={-1}>
          <Notice tone="success" role="status" title={notice}>
            {arrival?.detail}
          </Notice>
        </div>
      )}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <ProfileSummary user={user} />
        <nav aria-label="Account settings" className="ds-surface p-2">
          <ul className="grid grid-cols-1 gap-1">
            <li>
              <ProfileLink to="/profile/edit" icon={UserPen} label="Edit profile" detail="Full name and username" />
            </li>
            <li>
              <ProfileLink
                to="/profile/password"
                icon={KeyRound}
                label="Change password"
                detail="Logs out every other device"
              />
            </li>
          </ul>
        </nav>
      </div>
      {/* Below lg there is no sidebar, so this is where people log out. From lg the sidebar has it. */}
      <div className="lg:hidden">
        <LogoutButton look="button" />
      </div>
    </Page>
  )
}
