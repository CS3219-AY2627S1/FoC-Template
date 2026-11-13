/**
 * AI Assistance Disclosure
 * Tool: Cursor (GPT-5.6 Sol Medium)
 * Scope: Assisted with frontend implementation, debugging and UI refinement.
 * Author review: The generated code was reviewed, tested, and iteratively refined by the author through follow-up instructions.
 *
 */

import { useMemo, useState, type FormEvent } from 'react'
import {
  Alert,
  Box,
  Button,
  Link,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import nusLogo from '../assets/nus-logo.png'
import { ApiError } from '../api/users'
import { useAuth } from '../auth/AuthContext'
import { consumeLoginFlash } from '../auth/loginFlash'
import SuccessSnackbar from '../components/SuccessSnackbar'

function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()
  const locationState = location.state as
    | { from?: { pathname: string }; successMessage?: string }
    | null
  const from = locationState?.from?.pathname ?? '/home'
  const [successMessage] = useState(
    () => locationState?.successMessage ?? consumeLoginFlash() ?? '',
  )
  const [successSnackOpen, setSuccessSnackOpen] = useState(() => Boolean(successMessage))
  const [usernameOrEmail, setUsernameOrEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const hasSuccess = useMemo(
    () => Boolean(successMessage) && !errorMessage,
    [successMessage, errorMessage],
  )

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!usernameOrEmail.trim() || !password.trim()) {
      setErrorMessage('Please enter your username/email and password.')
      return
    }

    try {
      await login(usernameOrEmail.trim(), password)
      navigate(from, { replace: true })
    } catch (error) {
      console.error(error)
      // The User Service sends readable messages, e.g. "Invalid credentials."
      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : 'Could not reach the server. Please try again.',
      )
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
            justifyContent: 'space-between',
            gap: { xs: 3, md: 4 },
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
              Sign in to send and follow campus errands.
            </Typography>
          </Box>
          <Box
            component="img"
            src={nusLogo}
            alt="National University of Singapore"
            sx={{
              width: '100%',
              height: 'auto',
              p: { xs: 1.25, md: 1.5 },
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
            py: { xs: 3.5, md: 6 },
          }}
        >
          <form onSubmit={handleSubmit} noValidate>
            <Stack spacing={2.5}>
              <Box>
                <Typography component="h2" variant="h5" sx={{ fontWeight: 750 }}>
                  Log in
                </Typography>
                <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                  Use your FoC account to continue.
                </Typography>
              </Box>

              {hasSuccess && <Alert severity="success">{successMessage}</Alert>}
              {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

              <TextField
                required
                fullWidth
                label="Username or Email"
                value={usernameOrEmail}
                onChange={(event) => {
                  setUsernameOrEmail(event.target.value)
                  setErrorMessage('')
                }}
              />

              <TextField
                required
                fullWidth
                type="password"
                label="Password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  setErrorMessage('')
                }}
              />

              <Button type="submit" variant="contained" size="large">
                Log In
              </Button>

              <Typography color="text.secondary" sx={{ textAlign: 'center' }}>
                Don&apos;t have an account?{' '}
                <Link component={RouterLink} to="/register">
                  Register
                </Link>
              </Typography>
            </Stack>
          </form>
        </Paper>
      </Box>

      <SuccessSnackbar
        open={successSnackOpen && hasSuccess}
        message={successMessage}
        onClose={() => setSuccessSnackOpen(false)}
      />
    </Box>
  )
}

export default LoginPage
