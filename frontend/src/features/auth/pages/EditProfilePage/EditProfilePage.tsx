import { useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@base-ui/react/button'
import { Input } from '@base-ui/react/input'
import { useFacultiesQuery } from '#/hooks/useFacultiesQuery'
import { useProfileActions, useUserProfile } from '../../hooks/useUserProfile'
import { useAuth } from '../../providers/AuthProvider'
import { getProfileError } from '../../utils/getProfileError'
import { passwordSchema } from '../../schemas/password.schema'
import { UpdateEmailForm } from './components/UpdateEmailForm/UpdateEmailForm'
import type { UserProfileDto } from '../../types/auth.types'
import styles from './EditProfilePage.module.scss'

export const EditProfilePage = () => {
  const profile = useUserProfile()
  const faculties = useFacultiesQuery()
  if (profile.isPending || faculties.isPending)
    return <p role="status">Loading your profile...</p>
  if (!profile.data)
    return (
      <div role="alert">
        <p>Could not load your profile.</p>
        <Button
          onClick={() => {
            void profile.refetch()
          }}
        >
          Try again
        </Button>
      </div>
    )
  if (!faculties.data)
    return (
      <div role="alert">
        <p>Could not load faculty choices.</p>
        <Button onClick={() => void faculties.refetch()}>Try again</Button>
      </div>
    )
  return (
    <EditProfileForm
      key={profile.data.id}
      profile={profile.data}
      faculties={faculties.data}
    />
  )
}

const EditProfileForm = ({
  profile,
  faculties,
}: {
  profile: UserProfileDto
  faculties: string[]
}) => {
  const [name, setName] = useState(profile.name)
  const [phoneNumber, setPhoneNumber] = useState(profile.phoneNumber ?? '')
  const [faculty, setFaculty] = useState(profile.faculty ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>(
    {},
  )
  const [passwordError, setPasswordError] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const actions = useProfileActions()
  const auth = useAuth()
  const navigate = useNavigate()
  const initials = profile.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  const save = async () => {
    if (locked.current) return
    const fields: Record<string, string> = {}
    if (!name.trim()) fields.name = 'Enter your full name.'
    if (faculty && !faculties.includes(faculty))
      fields.faculty = 'Select a valid NUS faculty.'
    setErrors(fields)
    setError('')
    setMessage('')
    if (Object.keys(fields).length) return
    locked.current = true
    setBusy(true)
    try {
      const updated = await actions.update.mutateAsync({
        name,
        phoneNumber,
        faculty,
      })
      setName(updated.name)
      setPhoneNumber(updated.phoneNumber ?? '')
      setFaculty(updated.faculty ?? '')
      setMessage('Profile saved.')
    } catch (failure) {
      const details = getProfileError(failure)
      setErrors(details.fields)
      setError(details.message)
    } finally {
      locked.current = false
      setBusy(false)
    }
  }

  const changePassword = async () => {
    if (locked.current) return
    const fields: Record<string, string> = {}
    if (!currentPassword.trim())
      fields.currentPassword = 'Enter your current password.'
    const passwordResult = passwordSchema.safeParse(newPassword)
    if (!passwordResult.success)
      fields.newPassword = passwordResult.error.issues[0].message
    if (new TextEncoder().encode(currentPassword).length > 72)
      fields.currentPassword = 'Current password is too long.'
    if (newPassword && currentPassword === newPassword)
      fields.newPassword = 'Choose a different password.'
    setPasswordErrors(fields)
    setPasswordError('')
    if (Object.keys(fields).length) return
    locked.current = true
    setBusy(true)
    setChangingPassword(true)
    try {
      await actions.password.mutateAsync({ currentPassword, newPassword })
      setCurrentPassword('')
      setNewPassword('')
      await auth.logout()
      await navigate({ to: '/login', replace: true })
    } catch (failure) {
      const details = getProfileError(failure)
      setPasswordErrors(details.fields)
      setPasswordError(details.message)
    } finally {
      actions.password.reset()
      locked.current = false
      setBusy(false)
      setChangingPassword(false)
    }
  }

  const changePhoto = async (file?: File) => {
    if (locked.current) return
    setError('')
    setMessage('')
    if (
      file &&
      (!['image/jpeg', 'image/png'].includes(file.type) ||
        file.size > 2 * 1024 * 1024)
    ) {
      setError('Choose a JPEG or PNG image up to 2 MB.')
      return
    }
    locked.current = true
    setBusy(true)
    try {
      if (file) await actions.upload.mutateAsync(file)
      else await actions.remove.mutateAsync()
      setMessage(file ? 'Photo updated.' : 'Photo removed.')
    } catch (failure) {
      setError(getProfileError(failure).message)
    } finally {
      locked.current = false
      setBusy(false)
    }
  }

  const fieldError = (field: string, fields = errors) =>
    fields[field] ? (
      <p className={styles.fieldError} id={`${field}-error`}>
        {fields[field]}
      </p>
    ) : null

  return (
    <div className={styles.page}>
      <aside className={styles.summary} aria-label="Your profile">
        <div className={styles.avatar}>
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt={profile.name} />
          ) : (
            <span aria-label="Profile initials">{initials}</span>
          )}
        </div>
        <div className={styles.identity}>
          <h1>{profile.name}</h1>
          <p>{profile.email}</p>
        </div>
        <div className={styles.photoActions}>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png"
            hidden
            aria-label="Profile photo"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void changePhoto(file)
            }}
          />
          <Button disabled={busy} onClick={() => fileInput.current?.click()}>
            Change photo
          </Button>
          {profile.avatarUrl && (
            <Button
              disabled={busy}
              onClick={() => {
                void changePhoto()
              }}
            >
              Remove
            </Button>
          )}
        </div>
      </aside>
      <div className={styles.forms}>
        <form
          className={styles.form}
          noValidate
          aria-busy={busy}
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <fieldset className={styles.card} disabled={busy}>
            <legend className={styles.srOnly}>Edit your profile</legend>
            <h2>Edit Profile</h2>
            <div className={styles.field}>
              <label htmlFor="profile-name">
                Full Name <span aria-hidden="true">*</span>
              </label>
              <Input
                id="profile-name"
                value={name}
                onValueChange={setName}
                autoComplete="name"
                required
                maxLength={255}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? 'name-error' : undefined}
              />
              {fieldError('name')}
            </div>
            <div className={styles.field}>
              <label htmlFor="profile-phone">Phone Number</label>
              <Input
                id="profile-phone"
                type="tel"
                value={phoneNumber}
                onValueChange={setPhoneNumber}
                autoComplete="tel"
                placeholder="+65 9123 5436"
                aria-invalid={Boolean(errors.phoneNumber)}
                aria-describedby={
                  errors.phoneNumber ? 'phoneNumber-error' : undefined
                }
              />
              {fieldError('phoneNumber')}
            </div>
            <div className={styles.field}>
              <label htmlFor="profile-faculty">Faculty</label>
              <select
                id="profile-faculty"
                value={faculty}
                onChange={(event) => setFaculty(event.target.value)}
                aria-invalid={Boolean(errors.faculty)}
                aria-describedby={errors.faculty ? 'faculty-error' : undefined}
              >
                <option value="">No faculty</option>
                {faculties.map((facultyName) => (
                  <option key={facultyName} value={facultyName}>
                    {facultyName}
                  </option>
                ))}
              </select>
              {fieldError('faculty')}
            </div>
          </fieldset>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className={styles.success} role="status">
              {message}
            </p>
          )}
          <div className={styles.footer}>
            <Button className={styles.save} type="submit" disabled={busy}>
              {busy && !changingPassword ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
        <UpdateEmailForm busy={busy} />
        <form
          className={styles.form}
          noValidate
          aria-label="Change password"
          aria-busy={changingPassword}
          onSubmit={(event) => {
            event.preventDefault()
            void changePassword()
          }}
        >
          <fieldset className={styles.card} disabled={busy}>
            <legend className={styles.srOnly}>Change your password</legend>
            <h2>Change Password</h2>
            <p className={styles.hint}>
              Changing your password will sign you out. Save any profile changes
              first.
            </p>
            <div className={styles.field}>
              <label htmlFor="current-password">Current password</label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onValueChange={setCurrentPassword}
                autoComplete="current-password"
                aria-invalid={Boolean(passwordErrors.currentPassword)}
                aria-describedby={
                  passwordErrors.currentPassword
                    ? 'currentPassword-error'
                    : undefined
                }
              />
              {fieldError('currentPassword', passwordErrors)}
            </div>
            <div className={styles.field}>
              <label htmlFor="new-password">New password</label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onValueChange={setNewPassword}
                autoComplete="new-password"
                aria-invalid={Boolean(passwordErrors.newPassword)}
                aria-describedby={
                  passwordErrors.newPassword ? 'newPassword-error' : undefined
                }
              />
              {fieldError('newPassword', passwordErrors)}
            </div>
          </fieldset>
          {passwordError && (
            <p className={styles.error} role="alert">
              {passwordError}
            </p>
          )}
          <div className={styles.footer}>
            <Button className={styles.save} type="submit" disabled={busy}>
              {changingPassword ? 'Changing password...' : 'Change Password'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
