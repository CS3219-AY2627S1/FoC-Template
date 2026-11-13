/**
 * AI Assistance Disclosure
 * Tool: Cursor (GPT-5.6 Sol Medium)
 * Scope: Assisted with frontend implementation, debugging and UI refinement.
 * Author review: The generated code was reviewed, tested, and iteratively refined by the author through follow-up instructions.
 */

import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Stack,
  Typography,
} from '@mui/material'
import {
  ApiError,
  ForbiddenError,
  NotFoundError,
  getUserRoles,
  grantRole,
  revokeRole,
} from '../api/users'
import type { AdminUser, Role } from '../interfaces'

const roleOptions: { role: Role; label: string; description: string }[] = [
  {
    role: 'ADMIN',
    label: 'Admin',
    description: 'Can manage users, roles, and suppliers.',
  },
  {
    role: 'REQUESTER',
    label: 'Requester',
    description: 'Can create errand requests.',
  },
  {
    role: 'COURIER',
    label: 'Courier',
    description: 'Can accept and deliver errand requests.',
  },
]

type ManageRolesDialogProps = {
  user: AdminUser
  currentUserId: string | undefined
  onClose: () => void
  onRolesChanged: (userId: string, roles: Role[], message: string) => void
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ForbiddenError) {
    return 'Only admins can manage roles.'
  }
  if (error instanceof NotFoundError) {
    return 'User not found or account is deactivated.'
  }
  if (error instanceof ApiError || error instanceof Error) {
    return error.message
  }
  return 'Something went wrong. Please try again.'
}

function ManageRolesDialog({
  user,
  currentUserId,
  onClose,
  onRolesChanged,
}: ManageRolesDialogProps) {
  const [roles, setRoles] = useState<Role[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [pendingRole, setPendingRole] = useState<Role | null>(null)
  const [isConfirmAdminRevokeOpen, setIsConfirmAdminRevokeOpen] = useState(false)

  const isSelf = user.id === currentUserId

  useEffect(() => {
    let ignore = false

    getUserRoles(user.id)
      .then((data) => {
        if (!ignore) setRoles(data.roles)
      })
      .catch((error: unknown) => {
        if (!ignore) setLoadError(getErrorMessage(error))
      })

    return () => {
      ignore = true
    }
  }, [user.id])

  async function changeRole(role: Role, action: 'grant' | 'revoke') {
    setPendingRole(role)
    setActionError('')

    try {
      const data =
        action === 'grant'
          ? await grantRole(user.id, role)
          : await revokeRole(user.id, role)
      setRoles(data.roles)
      onRolesChanged(
        user.id,
        data.roles,
        action === 'grant'
          ? `Granted ${role} to ${user.username}.`
          : `Revoked ${role} from ${user.username}.`,
      )
    } catch (error) {
      setActionError(getErrorMessage(error))
    } finally {
      setPendingRole(null)
    }
  }

  function handleRevokeClick(role: Role) {
    if (role === 'ADMIN') {
      setIsConfirmAdminRevokeOpen(true)
      return
    }
    void changeRole(role, 'revoke')
  }

  function handleConfirmAdminRevoke() {
    setIsConfirmAdminRevokeOpen(false)
    void changeRole('ADMIN', 'revoke')
  }

  return (
    <>
      <Dialog open onClose={onClose} fullWidth maxWidth="sm">
        <DialogTitle>Manage roles for {user.username}</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Typography color="text.secondary">
              {user.firstName} {user.lastName} · {user.email}
            </Typography>

            {loadError && <Alert severity="error">{loadError}</Alert>}
            {actionError && <Alert severity="error">{actionError}</Alert>}

            {!roles && !loadError && (
              <Box sx={{ display: 'grid', placeItems: 'center', py: 3 }}>
                <CircularProgress size={28} aria-label="Loading roles" />
              </Box>
            )}

            {roles && (
              <Stack divider={<Divider flexItem />} spacing={1.5}>
                {roleOptions.map((option) => {
                  const hasRole = roles.includes(option.role)
                  const isOwnAdminRole = isSelf && option.role === 'ADMIN'
                  const isBusy = pendingRole !== null

                  return (
                    <Stack
                      key={option.role}
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1.5}
                      sx={{
                        alignItems: { sm: 'center' },
                        justifyContent: 'space-between',
                      }}
                    >
                      <Stack spacing={0.25}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                          <Typography sx={{ fontWeight: 600 }}>
                            {option.label}
                          </Typography>
                          <Chip
                            size="small"
                            variant={hasRole ? 'filled' : 'outlined'}
                            color={hasRole ? 'success' : 'default'}
                            label={hasRole ? 'Granted' : 'Not granted'}
                          />
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                          {option.description}
                        </Typography>
                        {isOwnAdminRole && (
                          <Typography variant="caption" color="text.secondary">
                            You cannot remove your own Admin role.
                          </Typography>
                        )}
                      </Stack>

                      {hasRole ? (
                        <Button
                          variant="outlined"
                          color="error"
                          size="small"
                          disabled={isBusy || isOwnAdminRole}
                          onClick={() => handleRevokeClick(option.role)}
                          sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, minWidth: 90 }}
                        >
                          {pendingRole === option.role ? 'Revoking…' : 'Revoke'}
                        </Button>
                      ) : (
                        <Button
                          variant="contained"
                          size="small"
                          disabled={isBusy}
                          onClick={() => void changeRole(option.role, 'grant')}
                          sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, minWidth: 90 }}
                        >
                          {pendingRole === option.role ? 'Granting…' : 'Grant'}
                        </Button>
                      )}
                    </Stack>
                  )
                })}
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={isConfirmAdminRevokeOpen}
        onClose={() => setIsConfirmAdminRevokeOpen(false)}
      >
        <DialogTitle>Revoke Admin from {user.username}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {user.username} will no longer be able to manage users, roles, or
            suppliers.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsConfirmAdminRevokeOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleConfirmAdminRevoke}>
            Revoke Admin
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

export default ManageRolesDialog
