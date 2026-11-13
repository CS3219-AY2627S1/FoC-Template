/**
 * AI Assistance Disclosure
 * Tool: Cursor (GPT-5.6 Sol Medium)
 * Scope: Assisted with frontend implementation, debugging and UI refinement.
 * Author review: The generated code was reviewed, tested, and iteratively refined by the author through follow-up instructions.
 */

import { useRef, useState, type FormEvent, type SyntheticEvent } from 'react'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Container,
  Divider,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { IconBadge, StudentIcon } from '../components/CampusArt'
import CreditsPanel from '../components/CreditsPanel'
import SuccessSnackbar from '../components/SuccessSnackbar'
import { useAuth } from '../auth/AuthContext'
import { setLoginFlash } from '../auth/loginFlash'
import {
  ApiError,
  UnauthorizedError,
  changePassword,
  updateCurrentUser,
} from '../api/users'
import type { Role } from '../interfaces'

const PASSWORD_CHANGED_MESSAGE =
  'Password changed successfully. Please log in with your new password.'

type AccountTab = 'profile' | 'security' | 'credits'

const ACCOUNT_TABS: AccountTab[] = ['profile', 'security', 'credits']

function parseAccountTab(value: string | null): AccountTab {
  if (value && ACCOUNT_TABS.includes(value as AccountTab)) {
    return value as AccountTab
  }
  return 'profile'
}

const MIN_PASSWORD_LENGTH = 15

const emptyPasswordForm = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
}

type PasswordFormErrors = Partial<Record<keyof typeof emptyPasswordForm, string>>

const roleChips: Record<Role, { label: string; color: 'default' | 'primary' | 'secondary' }> = {
  ADMIN: { label: 'Admin', color: 'default' },
  REQUESTER: { label: 'Requester', color: 'primary' },
  COURIER: { label: 'Courier', color: 'secondary' },
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <Stack spacing={0.25}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant="body1"
        color="text.primary"
        sx={{ fontSize: '1.05rem', fontWeight: 500 }}
      >
        {value}
      </Typography>
    </Stack>
  )
}

function validatePasswordForm(values: typeof emptyPasswordForm): PasswordFormErrors {
  const errors: PasswordFormErrors = {}

  if (!values.currentPassword) {
    errors.currentPassword = 'Enter your current password.'
  }

  if (!values.newPassword) {
    errors.newPassword = 'Enter a new password.'
  } else if (values.newPassword.length < MIN_PASSWORD_LENGTH) {
    errors.newPassword = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  } else if (values.newPassword === values.currentPassword) {
    errors.newPassword = 'New password must be different from your current password.'
  }

  if (!values.confirmPassword) {
    errors.confirmPassword = 'Confirm your new password.'
  } else if (values.confirmPassword !== values.newPassword) {
    errors.confirmPassword = 'Passwords do not match.'
  }

  return errors
}

function ChangePasswordSection() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const [values, setValues] = useState(emptyPasswordForm)
  const [errors, setErrors] = useState<PasswordFormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successOpen, setSuccessOpen] = useState(false)
  const finishingRef = useRef(false)

  function updateField(field: keyof typeof emptyPasswordForm, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }))
    setErrors((previous) => ({ ...previous, [field]: undefined }))
  }

  async function finishAfterSuccess() {
    if (finishingRef.current) {
      return
    }
    finishingRef.current = true
    setSuccessOpen(false)

    // Persist flash before logout so RequireAuth's redirect cannot drop the message.
    setLoginFlash(PASSWORD_CHANGED_MESSAGE)
    await logout()
    navigate('/login', {
      replace: true,
      state: { successMessage: PASSWORD_CHANGED_MESSAGE },
    })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMsg(null)

    const validationErrors = validatePasswordForm(values)
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) {
      return
    }

    setSubmitting(true)

    try {
      await changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      })
    } catch (error) {
      setErrorMsg(
        error instanceof UnauthorizedError
          ? 'Your session has expired. Please log in again.'
          : error instanceof ApiError
            ? error.message
            : 'Could not change your password. Please try again.',
      )
      setSubmitting(false)
      return
    }

    // Show success first; logout after the snackbar so the user sees confirmation.
    setSuccessOpen(true)
  }

  function handleClear() {
    setValues(emptyPasswordForm)
    setErrors({})
    setErrorMsg(null)
  }

  return (
    <>
      <Paper
        variant="outlined"
        component="section"
        sx={{
          p: { xs: 2, md: 3 },
          borderColor: 'divider',
          boxShadow: '0 8px 24px rgba(23, 35, 45, 0.05)',
        }}
      >
        <form onSubmit={handleSubmit} noValidate>
          <Stack spacing={2}>
            <Box>
              <Typography component="h2" variant="h6" sx={{ fontWeight: 600 }}>
                Change Password
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                You will be logged out on all devices after changing your password.
              </Typography>
            </Box>

            {errorMsg && <Alert severity="error">{errorMsg}</Alert>}

            <TextField
              required
              type="password"
              label="Current Password"
              autoComplete="current-password"
              value={values.currentPassword}
              onChange={(event) => updateField('currentPassword', event.target.value)}
              error={Boolean(errors.currentPassword)}
              helperText={errors.currentPassword}
              disabled={submitting || successOpen}
            />
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 2,
              }}
            >
              <TextField
                required
                type="password"
                label="New Password"
                autoComplete="new-password"
                value={values.newPassword}
                onChange={(event) => updateField('newPassword', event.target.value)}
                error={Boolean(errors.newPassword)}
                helperText={
                  errors.newPassword || `Use at least ${MIN_PASSWORD_LENGTH} characters.`
                }
                disabled={submitting || successOpen}
              />
              <TextField
                required
                type="password"
                label="Confirm New Password"
                autoComplete="new-password"
                value={values.confirmPassword}
                onChange={(event) => updateField('confirmPassword', event.target.value)}
                error={Boolean(errors.confirmPassword)}
                helperText={errors.confirmPassword}
                disabled={submitting || successOpen}
              />
            </Box>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Button type="submit" variant="contained" disabled={submitting || successOpen}>
                {submitting && !successOpen ? 'Changing...' : 'Change Password'}
              </Button>
              <Button
                variant="outlined"
                onClick={handleClear}
                disabled={submitting || successOpen}
              >
                Clear
              </Button>
            </Stack>
          </Stack>
        </form>
      </Paper>

      <SuccessSnackbar
        open={successOpen}
        message="Password changed successfully. Logging you out…"
        onClose={() => {
          void finishAfterSuccess()
        }}
      />
    </>
  )
}

function AccountPage() {
  const { user, setUser } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = parseAccountTab(searchParams.get('tab'))

  const [formValues, setFormValues] = useState({
    username: user?.username ?? '',
    email: user?.email ?? '',
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
  })
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  function handleTabChange(_event: SyntheticEvent, newTab: AccountTab) {
    setIsEditing(false)
    setErrorMsg(null)
    setSuccessMsg(null)
    setSearchParams(newTab === 'profile' ? {} : { tab: newTab }, { replace: true })
  }

  function syncFormFromUser() {
    if (!user) return
    setFormValues({
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    })
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const updatedUser = await updateCurrentUser({
        username: formValues.username,
        email: formValues.email,
        firstName: formValues.firstName,
        lastName: formValues.lastName,
      })
      setUser(updatedUser)
      setSuccessMsg('Profile updated successfully!')
      setIsEditing(false)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update profile'
      setErrorMsg(message)
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    if (user) {
      setFormValues({
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      })
    }
    setErrorMsg(null)
    setIsEditing(false)
  }

  if (!user) {
    return null
  }

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username
  const avatarInitials = (
    `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.trim() ||
    user.username.slice(0, 2)
  ).toUpperCase()

  return (
    <Container component="main" maxWidth="lg" sx={{ py: { xs: 2, md: 4 } }}>
      <Stack spacing={2}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{
            alignItems: { sm: 'center' },
            justifyContent: 'space-between',
          }}
        >
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <IconBadge tone="blue">
              <StudentIcon />
            </IconBadge>
            <Box>
              <Typography component="h1" variant="h4">
                Account
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 0.25 }}>
                Manage your profile, password, and FoC credits.
              </Typography>
            </Box>
          </Stack>

          {tab === 'profile' && !isEditing && (
            <Button
              variant="contained"
              onClick={() => {
                syncFormFromUser()
                setErrorMsg(null)
                setSuccessMsg(null)
                setIsEditing(true)
              }}
              sx={{ alignSelf: { xs: 'flex-start', sm: 'auto' } }}
            >
              Edit Profile
            </Button>
          )}
        </Stack>

        <Paper
          variant="outlined"
          sx={{
            p: { xs: 2, md: 2.5 },
            borderColor: 'divider',
            boxShadow: '0 8px 24px rgba(23, 35, 45, 0.05)',
          }}
        >
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{ alignItems: { sm: 'center' } }}
          >
            <Avatar
              alt={fullName}
              sx={{
                width: { xs: 72, sm: 88 },
                height: { xs: 72, sm: 88 },
                fontSize: '1.5rem',
                fontWeight: 700,
                bgcolor: 'primary.main',
                color: '#FFFFFF',
              }}
            >
              {avatarInitials}
            </Avatar>
            <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
              <Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>
                {fullName}
              </Typography>
              <Typography color="text.secondary" sx={{ wordBreak: 'break-word' }}>
                {user.email}
              </Typography>
            </Stack>
          </Stack>
        </Paper>

        <Tabs
          value={tab}
          onChange={handleTabChange}
          variant="scrollable"
          allowScrollButtonsMobile
          aria-label="Account sections"
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label="Profile" value="profile" />
          <Tab label="Change Password" value="security" />
          <Tab label="Credits" value="credits" />
        </Tabs>

        {tab === 'profile' && (
          <>
            {errorMsg && <Alert severity="error">{errorMsg}</Alert>}
            {successMsg && <Alert severity="success">{successMsg}</Alert>}

            <Paper
              variant="outlined"
              sx={{
                p: { xs: 2, md: 3 },
                borderColor: 'divider',
                boxShadow: '0 8px 24px rgba(23, 35, 45, 0.05)',
              }}
            >
              {isEditing ? (
                <form onSubmit={handleSave}>
                  <Stack spacing={2}>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                        gap: 2,
                      }}
                    >
                      <TextField
                        required
                        label="Username"
                        value={formValues.username}
                        onChange={(event) =>
                          setFormValues({
                            ...formValues,
                            username: event.target.value,
                          })
                        }
                      />
                      <TextField
                        required
                        type="email"
                        label="Email"
                        value={formValues.email}
                        onChange={(event) =>
                          setFormValues({
                            ...formValues,
                            email: event.target.value,
                          })
                        }
                      />
                      <TextField
                        required
                        label="First Name"
                        value={formValues.firstName}
                        onChange={(event) =>
                          setFormValues({
                            ...formValues,
                            firstName: event.target.value,
                          })
                        }
                      />
                      <TextField
                        required
                        label="Last Name"
                        value={formValues.lastName}
                        onChange={(event) =>
                          setFormValues({
                            ...formValues,
                            lastName: event.target.value,
                          })
                        }
                      />
                    </Box>

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                      <Button type="submit" variant="contained" disabled={saving}>
                        {saving ? 'Saving...' : 'Save'}
                      </Button>
                      <Button variant="outlined" onClick={handleCancel} disabled={saving}>
                        Cancel
                      </Button>
                    </Stack>
                  </Stack>
                </form>
              ) : (
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                    gap: { xs: 1.5, sm: 2 },
                  }}
                >
                  <ProfileField label="Username" value={user.username} />
                  <ProfileField label="Email" value={user.email} />
                  <ProfileField label="First Name" value={user.firstName} />
                  <ProfileField label="Last Name" value={user.lastName} />
                </Box>
              )}

              <Divider sx={{ my: 2.5 }} />

              <Stack component="section" spacing={1.25}>
                <Typography component="h2" variant="h6" sx={{ fontWeight: 600 }}>
                  Available Roles
                </Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                  {user.roles.map((role) => (
                    <Chip
                      key={role}
                      label={roleChips[role]?.label ?? role}
                      color={roleChips[role]?.color ?? 'default'}
                      variant="outlined"
                    />
                  ))}
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  Roles are managed by the system and cannot be edited here.
                </Typography>
              </Stack>
            </Paper>
          </>
        )}

        {tab === 'security' && <ChangePasswordSection />}

        {tab === 'credits' && <CreditsPanel />}
      </Stack>
    </Container>
  )
}

export default AccountPage
