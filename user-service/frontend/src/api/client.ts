import { type AuthSession, type WorkspaceRole, readSession } from '../auth/session'

type RegistrationRequest = {
  email: string
  username: string
  password: string
}

type LoginRequest = {
  email: string
  password: string
}

type PasswordResetRequest = {
  email: string
}

type PasswordResetConfirmation = {
  email: string
  code: string
  password: string
}

type PasswordResetVerification = {
  email: string
  code: string
}

type EmailVerificationRequest = {
  email: string
  code: string
}

type EmailVerificationResendRequest = {
  email: string
}

type UsernameChangeRequest = {
  username: string
}

type PasswordChangeRequest = {
  currentPassword: string
  newPassword: string
}

type SessionRoleChangeRequest = {
  role: WorkspaceRole
}

export type UserProfile = {
  userId: string
  email: string
  username: string
  roles: WorkspaceRole[]
  status: 'UNVERIFIED' | 'ACTIVE' | 'BANNED'
  createdAt: string
}

export type AdminAccount = {
  userId: string
  email: string
  username: string
  roles: WorkspaceRole[]
  status: 'UNVERIFIED' | 'ACTIVE' | 'BANNED'
  createdAt: string
}

export type AdminAccountPage = {
  content: AdminAccount[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly retryAfterSeconds?: number,
    public readonly code?: string,
  ) {
    super(message)
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const session = readSession()

  if (session) {
    headers.set('Authorization', `${session.tokenType} ${session.accessToken}`)
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(path, { ...init, headers })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const retryAfter = response.headers?.get?.('Retry-After')
    const retryAfterSeconds = retryAfter && /^\d+$/.test(retryAfter) ? Number.parseInt(retryAfter, 10) : undefined
    throw new ApiError(response.status, body?.detail ?? 'Something went wrong. Please try again.', retryAfterSeconds, body?.code)
  }
  if (response.status === 202 || response.status === 204) {
    return undefined as T
  }
  return response.json() as Promise<T>
}

async function requestPasswordResetWithCooldown(requestBody: PasswordResetRequest): Promise<number> {
  const response = await fetch('/api/users/password-reset-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new ApiError(response.status, body?.detail ?? 'Something went wrong. Please try again.')
  }
  const retryAfter = response.headers?.get?.('Retry-After')
  return retryAfter && /^\d+$/.test(retryAfter) ? Number.parseInt(retryAfter, 10) : 90
}

export const api = {
  register(requestBody: RegistrationRequest) {
    return request('/api/users/registrations', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    })
  },
  login(requestBody: LoginRequest) {
    return request<AuthSession>('/api/users/login', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    })
  },
  activateCreditAccount() {
    return request('/api/credits/me', { method: 'POST' })
  },
  requestPasswordReset(requestBody: PasswordResetRequest) {
    return requestPasswordResetWithCooldown(requestBody)
  },
  confirmPasswordReset(requestBody: PasswordResetConfirmation) {
    return request<void>('/api/users/password-reset-confirmations', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    })
  },
  verifyPasswordReset(requestBody: PasswordResetVerification) {
    return request<void>('/api/users/password-reset-verifications', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    })
  },
  verifyEmail(requestBody: EmailVerificationRequest) {
    return request<void>('/api/users/email-verifications', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    })
  },
  resendEmailVerification(requestBody: EmailVerificationResendRequest) {
    return request<void>('/api/users/email-verification-resends', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    })
  },
  getProfile() {
    return request<UserProfile>('/api/users/me', { method: 'GET' })
  },
  changeUsername(requestBody: UsernameChangeRequest) {
    return request<UserProfile>('/api/users/me/username', {
      method: 'PATCH',
      body: JSON.stringify(requestBody),
    })
  },
  changePassword(requestBody: PasswordChangeRequest) {
    return request<void>('/api/users/me/password', {
      method: 'PATCH',
      body: JSON.stringify(requestBody),
    })
  },
  changeSessionRole(requestBody: SessionRoleChangeRequest) {
    return request<AuthSession>('/api/users/me/session-role', {
      method: 'PATCH',
      body: JSON.stringify(requestBody),
    })
  },
  listAdminAccounts(query = '', page = 0, size = 20) {
    const parameters = new URLSearchParams({ page: String(page), size: String(size) })
    if (query.trim()) parameters.set('query', query.trim())
    return request<AdminAccountPage>(`/api/users/admin/accounts?${parameters.toString()}`, { method: 'GET' })
  },
  setAdministrator(userId: string, administrator: boolean) {
    return request<AdminAccount>(`/api/users/admin/accounts/${encodeURIComponent(userId)}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ administrator }),
    })
  },
  setAccountStatus(userId: string, status: 'ACTIVE' | 'BANNED', reason?: string) {
    return request<AdminAccount>(`/api/users/admin/accounts/${encodeURIComponent(userId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, ...(reason !== undefined ? { reason } : {}) }),
    })
  },
}
