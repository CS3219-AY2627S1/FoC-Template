/**
 * AI Assistance Disclosure
 * Tool: Cursor (GPT-5.6 Sol Medium)
 * Scope: Assisted with frontend implementation, debugging and UI refinement.
 * Author review: The generated code was reviewed, tested, and iteratively refined by the author through follow-up instructions.
 */

import type { ReactNode } from 'react'
import {
  Alert,
  Box,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Container,
  Stack,
  Typography,
} from '@mui/material'
import { useAuth } from '../auth/AuthContext'
import type { UserMode } from '../components/AppNavigation'
import {
  CheckTaskIcon,
  ClipboardIcon,
  DeliveryBagIcon,
  IconBadge,
} from '../components/CampusArt'
import CampusMap from '../components/CampusMap'

type QuickAction = {
  title: string
  description: string
  to: string
  /** Workspace to activate before navigating (cross-mode Home shortcuts). */
  mode: UserMode
  icon: ReactNode
  tone: 'blue' | 'teal' | 'amber'
}

type HomePageProps = {
  onWorkspaceNavigate: (mode: UserMode, path: string) => void
}

function HomePage({ onWorkspaceNavigate }: HomePageProps) {
  const { user, canRequest, canCourier, isAdmin } = useAuth()
  const displayName = user
    ? user.firstName?.trim() || user.username
    : 'there'

  const quickActions: QuickAction[] = []

  if (canRequest) {
    quickActions.push(
      {
        title: 'Create Request',
        description: 'Start a campus errand by choosing a supplier.',
        to: '/suppliers',
        mode: 'requester',
        icon: <ClipboardIcon />,
        tone: 'blue',
      },
      {
        title: 'Browse Suppliers',
        description: 'Find food, printing, and other useful campus services.',
        to: '/suppliers',
        mode: 'requester',
        icon: <DeliveryBagIcon />,
        tone: 'blue',
      },
      {
        title: 'My Requests',
        description: 'Track active and past requests you placed.',
        to: '/requests',
        mode: 'requester',
        icon: <ClipboardIcon />,
        tone: 'blue',
      },
    )
  }

  if (canCourier) {
    quickActions.push(
      {
        title: 'Available Requests',
        description: 'Discover open campus errands you can accept.',
        to: '/fulfil',
        mode: 'courier',
        icon: <DeliveryBagIcon />,
        tone: 'teal',
      },
      {
        title: 'My Tasks',
        description: 'Track active courier tasks and past history.',
        to: '/my-tasks',
        mode: 'courier',
        icon: <CheckTaskIcon />,
        tone: 'teal',
      },
    )
  }

  if (isAdmin) {
    quickActions.push({
      title: 'Admin Dashboard',
      description: 'Manage users, roles, and campus suppliers.',
      to: '/admin',
      mode: 'admin',
      icon: <CheckTaskIcon />,
      tone: 'amber',
    })
  }

  const roleLabels = [
    canRequest ? 'Requester' : null,
    canCourier ? 'Courier' : null,
    isAdmin ? 'Admin' : null,
  ].filter(Boolean)

  return (
    <Container component="main" maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
      <Stack spacing={{ xs: 2.5, md: 3.5 }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: '1.05fr 0.95fr' },
            gap: { xs: 2, md: 3 },
            overflow: 'hidden',
            p: { xs: 2.5, md: 4 },
            borderRadius: 4,
            color: '#FFFFFF',
            background:
              'linear-gradient(135deg, #0C2436 0%, #12324C 48%, #1E5680 100%)',
            boxShadow: '0 18px 40px rgba(18, 35, 48, 0.22)',
          }}
        >
          <Stack spacing={1.5} sx={{ justifyContent: 'center' }}>
            <Typography
              variant="overline"
              sx={{ fontWeight: 800, letterSpacing: '0.12em', color: '#C5DDF0' }}
            >
              Friend of Campus
            </Typography>
            <Typography
              component="h1"
              variant="h3"
              sx={{ fontWeight: 750, letterSpacing: '-0.03em', color: '#FFFFFF' }}
            >
              Manage your{' '}
              <Box component="span" sx={{ color: '#C5DDF0' }}>
                campus errands
              </Box>
            </Typography>
            <Typography sx={{ maxWidth: 520, fontSize: '1.05rem', color: 'rgba(255,255,255,0.86)' }}>
              Welcome back, {displayName}. Use the shortcuts below to request help, fulfil
              tasks, or open admin tools — depending on your roles.
            </Typography>
            {roleLabels.length > 0 && (
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', pt: 0.5 }}>
                {roleLabels.map((label) => (
                  <Chip
                    key={label}
                    label={label}
                    size="small"
                    sx={{
                      color: '#FFFFFF',
                      bgcolor: 'rgba(255,255,255,0.16)',
                      border: '1px solid rgba(255,255,255,0.28)',
                    }}
                  />
                ))}
              </Stack>
            )}
          </Stack>
          <CampusMap />
        </Box>

        {quickActions.length > 0 ? (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, minmax(0, 1fr))',
                lg: 'repeat(3, minmax(0, 1fr))',
              },
              gap: { xs: 2, md: 2.5 },
            }}
          >
            {quickActions.map((action) => (
              <Card
                key={`${action.title}-${action.to}`}
                variant="outlined"
                sx={{
                  height: '100%',
                  borderColor: 'divider',
                  bgcolor: 'background.paper',
                  boxShadow: '0 12px 28px rgba(18, 35, 48, 0.1)',
                  transition: 'transform 160ms ease, box-shadow 160ms ease',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: '0 18px 36px rgba(18, 35, 48, 0.16)',
                  },
                }}
              >
                <CardActionArea
                  sx={{ height: '100%' }}
                  onClick={() => onWorkspaceNavigate(action.mode, action.to)}
                >
                  <Box
                    sx={{
                      height: 6,
                      bgcolor:
                        action.tone === 'teal'
                          ? 'secondary.main'
                          : action.tone === 'amber'
                            ? '#C2410C'
                            : 'primary.main',
                    }}
                  />
                  <CardContent sx={{ p: 2.5 }}>
                    <Stack spacing={2}>
                      <IconBadge tone={action.tone === 'amber' ? 'blue' : action.tone}>
                        {action.icon}
                      </IconBadge>
                      <Stack spacing={0.75}>
                        <Typography component="h2" variant="h6">
                          {action.title}
                        </Typography>
                        <Typography color="text.secondary">
                          {action.description}
                        </Typography>
                      </Stack>
                    </Stack>
                  </CardContent>
                </CardActionArea>
              </Card>
            ))}
          </Box>
        ) : (
          <Alert severity="info" variant="outlined" sx={{ bgcolor: 'background.paper' }}>
            Your account has no workflow roles yet. Ask an admin to assign Requester, Courier,
            or Admin access.
          </Alert>
        )}
      </Stack>
    </Container>
  )
}

export default HomePage
