import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Button } from '@base-ui/react/button'
import { useUserProfile } from '../../hooks/useUserProfile'
import { useAuth } from '../../providers/AuthProvider'
import styles from './ProfilePage.module.scss'

const ActivityPreview = () => (
  <section className={styles.activity} aria-label="Activity preview">
    <h2>Activity</h2>
    <p className={styles.preview}>Sample activity</p>
    <dl>
      <div>
        <dt>Requester errands</dt>
        <dd>8</dd>
      </div>
      <div>
        <dt>Courier errands</dt>
        <dd className={styles.courier}>5</dd>
      </div>
    </dl>
  </section>
)

export const ProfilePage = () => {
  const profile = useUserProfile()
  const auth = useAuth()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)

  const signOut = async () => {
    setSigningOut(true)
    await auth.logout()
    await navigate({ to: '/login', replace: true })
  }

  return (
    <section className={styles.page}>
      <h1>My Profile</h1>
      <div className={styles.content}>
        <div className={styles.card}>
          {profile.data ? (
            <>
              <h2>{profile.data.name}</h2>
              <p className={styles.email}>{profile.data.email}</p>
              <dl className={styles.details}>
                <div>
                  <dt>Full Name</dt>
                  <dd>{profile.data.name}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{profile.data.email}</dd>
                </div>
                <div>
                  <dt>Phone Number</dt>
                  <dd>{profile.data.phoneNumber || 'Not provided'}</dd>
                </div>
                <div>
                  <dt>Faculty</dt>
                  <dd>{profile.data.faculty || 'Not provided'}</dd>
                </div>
              </dl>
              <Link className={styles.edit} to="/profile/edit">
                Edit Profile
              </Link>
            </>
          ) : profile.isPending ? (
            <p role="status">Loading your profile...</p>
          ) : (
            <div role="alert">
              <p>Could not load your profile.</p>
              <Button onClick={() => void profile.refetch()}>Try again</Button>
            </div>
          )}
        </div>
        <aside className={styles.sidebar}>
          <ActivityPreview />
          <Button
            className={styles.signOut}
            disabled={signingOut}
            onClick={() => void signOut()}
          >
            {signingOut ? 'Signing out...' : 'Sign Out'}
          </Button>
        </aside>
      </div>
    </section>
  )
}
