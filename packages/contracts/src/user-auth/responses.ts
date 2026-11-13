import type { UserApiError } from './errors'
import type { UserRole } from './models'
export type ApiSuccess<T> = { ok: true; data: T }
export type ApiFailure = { ok: false; error: UserApiError }
export type ApiResult<T> = ApiSuccess<T> | ApiFailure
export type RegisterResponse = { verificationRequired: true }
export type AuthenticatedUser = {
  subject: string
  email: string
  emailVerified: boolean
  role: UserRole
}
export type LoginResponse = { user: AuthenticatedUser }
export type SubmitOtpAndLoginResponse = LoginResponse
export type RefreshResponse = LoginResponse
export type GetAuthResponse = LoginResponse
