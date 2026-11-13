import { createContext } from 'react'
import type { AuthSession, WorkspaceRole } from './session'

export interface AuthContextValue {
  accessDenied: boolean
  session: AuthSession | null
  workspaceBusy: boolean
  workspaceError: string
  selectWorkspaceRole: (role: WorkspaceRole) => Promise<boolean>
  signOut: () => void
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
)
