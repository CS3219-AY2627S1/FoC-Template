/**
 * AI Assistance Disclosure
 * Tool: Cursor (GPT-5.6 Sol Medium)
 * Scope: Assisted with frontend implementation, debugging and UI refinement.
 * Author review: The generated code was reviewed, tested, and iteratively refined by the author through follow-up instructions.
 */

import { useState, type FormEvent } from 'react'
import {
  Box,
  Button,
  Link,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import nusLogo from '../assets/nus-logo.png'
import SuccessSnackbar from '../components/SuccessSnackbar'
import { register } from '../api/users'

const allowedEmailDomains = [
  '@u.nus.edu',
  '@u.duke.nus.edu',
  '@u.yale-nus.edu.sg',
]

const emptyErrors = {
  username: '',
  email: '',
  password: '',
  firstName: '',
  lastName: '',
}

function RegisterPage() {
  const navigate = useNavigate()
  const [formValues, setFormValues] = useState({
    username: '',
    email: '',
    password: '',
    firstName: '',
    lastName: '',
  })
  const [errors, setErrors] = useState(emptyErrors)
  const [isSuccessOpen, setIsSuccessOpen] = useState(false)
  const [submitError, setSubmitError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const normalizedEmail = formValues.email.trim().toLowerCase()
    const emailParts = normalizedEmail.split('@')
    const hasAllowedEmailDomain =
      emailParts.length === 2 &&
      emailParts[0].length > 0 &&
      allowedEmailDomains.includes(`@${emailParts[1]}`)

    const newErrors = {
      username: formValues.username.trim() ? '' : 'Username is required.',
      email: !normalizedEmail
        ? 'NUSNET email address is required.'
        : hasAllowedEmailDomain
          ? ''
          : 'Use an approved NUSNET email domain.',
      password: !formValues.password
        ? 'Password is required.'
        : formValues.password.length >= 15
          ? ''
          : 'Password must be at least 15 characters.',
      firstName: formValues.firstName.trim() ? '' : 'First name is required.',
      lastName: formValues.lastName.trim() ? '' : 'Last name is required.',
    }

    setErrors(newErrors)

    if (Object.values(newErrors).some((message) => message)) {
      return
    }

    try {
      setSubmitError('')
      await register({
        username: formValues.username.trim(),
        email: formValues.email.trim(),
        password: formValues.password.trim(),
        firstName: formValues.firstName.trim(),
        lastName: formValues.lastName.trim(),
      })
      setIsSuccessOpen(true)
    } catch (error) {
      console.error(error)
      setSubmitError('Could not create your account. Please try again.')
    }
  }

  return (
    <Box
      component="main"
      sx={{
        minHeight: '100svh',
        display: 'grid',
        alignItems: 'center',
        px: { xs: 2, md: 4 },
        py: { xs: 3, md: 5 },
        backgroundColor: '#E7EEF3',
        backgroundImage:
          'radial-gradient(circle at 0% 0%, rgba(18, 50, 76, 0.16) 0%, rgba(231, 238, 243, 0) 34%), radial-gradient(circle at 100% 100%, rgba(31, 138, 128, 0.12) 0%, rgba(231, 238, 243, 0) 30%)',
      }}
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: 920,
          mx: 'auto',
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1.05fr 0.95fr' },
          borderRadius: 4,
          overflow: 'hidden',
          boxShadow: '0 18px 40px rgba(18, 35, 48, 0.16)',
        }}
      >
        <Box
          sx={{
            color: '#FFFFFF',
            bgcolor: '#12324C',
            px: { xs: 3, md: 4.5 },
            py: { xs: 4, md: 5 },
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start',
            gap: 3,
          }}
        >
          <Box>
            <Typography
              component="h1"
              sx={{ fontWeight: 750, letterSpacing: '-0.03em', fontSize: { xs: '2.1rem', md: '2.75rem' }, lineHeight: 1.15 }}
            >
              Friend of Campus (FoC)
            </Typography>
            <Typography sx={{ mt: 1.5, fontSize: { xs: '1.05rem', md: '1.2rem' }, color: 'rgba(255,255,255,0.84)' }}>
              Create your campus errands profile.
            </Typography>
          </Box>
          <Box
            component="img"
            src={nusLogo}
            alt="National University of Singapore"
            sx={{
              width: '100%',
              height: 'auto',
              p: { xs: 1.25, md: 1.75 },
              borderRadius: 2,
              bgcolor: '#FFFFFF',
            }}
          />
        </Box>

        <Paper
          elevation={0}
          sx={{
            borderRadius: 0,
            px: { xs: 3, md: 4.5 },
            py: { xs: 3.5, md: 5 },
          }}
        >
          <form onSubmit={handleSubmit} noValidate>
            <Stack spacing={2.5}>
              <Box>
                <Typography component="h2" variant="h5" sx={{ fontWeight: 750 }}>
                  Register
                </Typography>
                <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                  Use your NUSNET email to create an account.
                </Typography>
              </Box>
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
                error={Boolean(errors.username)}
                helperText={errors.username}
              />

              <TextField
                required
                type="email"
                label="NUSNET Email Address"
                value={formValues.email}
                onChange={(event) =>
                  setFormValues({ ...formValues, email: event.target.value })
                }
                error={Boolean(errors.email)}
                helperText={
                  errors.email ||
                  'Allowed: @u.nus.edu, @u.duke.nus.edu, @u.yale-nus.edu.sg'
                }
              />

              <TextField
                required
                type="password"
                label="Password"
                value={formValues.password}
                onChange={(event) =>
                  setFormValues({ ...formValues, password: event.target.value })
                }
                error={Boolean(errors.password)}
                helperText={
                  errors.password || 'Use at least 15 characters.'
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
                error={Boolean(errors.firstName)}
                helperText={errors.firstName}
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
                error={Boolean(errors.lastName)}
                helperText={errors.lastName}
              />

              {submitError && (
                <Typography color="error" variant="body2">
                  {submitError}
                </Typography>
              )}

              <Button type="submit" variant="contained" size="large">
                Register
              </Button>

              <Typography color="text.secondary" sx={{ textAlign: 'center' }}>
                Already have an account?{' '}
                <Link component={RouterLink} to="/login">
                  Log in
                </Link>
              </Typography>
            </Stack>
          </form>
        </Paper>
      </Box>

      <SuccessSnackbar
        open={isSuccessOpen}
        message="Registered successfully! Taking you to login…"
        onClose={() => {
          setIsSuccessOpen(false)
          navigate('/login')
        }}
      />
    </Box>
  )
}

export default RegisterPage
