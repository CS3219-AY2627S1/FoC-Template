/*
AI Assistance Disclosure:
Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-09-19
Scope: Implemented profile editing, changed-field submission, and save/error feedback
Author review: I reviewed correctness and edited the changes to fit the project
*/

import { useState, type FormEvent } from 'react'
import { CampusErrandsAPIError } from '../../api/models'
import { useCampusErrandsAPI } from '../../api/useCampusErrandsAPI'
import { useToast } from '../../components/toast/useToast'
import { useUser } from '../../components/user/UserContext'
import type { UpdateCurrentUserProfileRequest } from './models'
import styles from './Profile.module.css'

const Profile = () => {
  const api = useCampusErrandsAPI()
  const { showErrorToast, showSuccessToast } = useToast()
  const { profile, setProfile } = useUser()
  const [username, setUsername] = useState(profile.username)
  const [email, setEmail] = useState(profile.email)
  const [isSaving, setIsSaving] = useState(false)

  const normalizedUsername = username.trim()
  const normalizedEmail = email.trim().toLowerCase()
  const usernameChanged = normalizedUsername !== profile.username
  const emailChanged = normalizedEmail !== profile.email
  const hasChanges = usernameChanged || emailChanged

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!hasChanges) return

    const update: UpdateCurrentUserProfileRequest = {}
    if (usernameChanged) update.username = normalizedUsername
    if (emailChanged) update.email = normalizedEmail

    setIsSaving(true)
    try {
      const updatedProfile = await api.user.authentication.updateCurrentUser(update)
      setProfile(updatedProfile)
      setUsername(updatedProfile.username)
      setEmail(updatedProfile.email)
      showSuccessToast('Profile updated.')
    } catch (error) {
      showErrorToast(error instanceof CampusErrandsAPIError
        ? error.message
        : 'Unable to update your profile. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>Your account</p>
          <h1>Profile</h1>
          <p>Keep the details people use to recognise you around campus up to date.</p>
        </div>

        <section className={styles.profileCard} aria-labelledby="profile-details-title">
          <div className={styles.cardHeading}>
            <div>
              <p className={styles.eyebrow}>Personal details</p>
              <h2 id="profile-details-title">How you appear</h2>
            </div>
            <span>Requester & courier</span>
          </div>

          <form onSubmit={(event) => void handleSubmit(event)}>
            <label>
              Username
              <input
                required
                maxLength={50}
                name="username"
                autoComplete="username"
                spellCheck={false}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>
            <label>
              Email
              <input
                required
                type="email"
                name="email"
                autoComplete="email"
                spellCheck={false}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <div className={styles.formActions}>
              <p>{hasChanges ? 'You have unsaved changes.' : 'Your profile is up to date.'}</p>
              <button type="submit" disabled={!hasChanges || !normalizedUsername || !normalizedEmail || isSaving}>
                {isSaving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </section>
      </main>
      <footer className={styles.footer}>Campus Errands · Small favours, better campus days.</footer>
    </div>
  )
}

export default Profile
