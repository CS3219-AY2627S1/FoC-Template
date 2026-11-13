export type UserField =
  | 'email'
  | 'password'
  | 'passwordConfirmation'
  | 'currentPassword'
  | 'newPassword'
  | 'newPasswordConfirmation'
  | 'code'
export type UserApiErrorCode =
  | 'VALIDATION_FAILED'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_ALREADY_REGISTERED'
  | 'EMAIL_NOT_VERIFIED'
  | 'EMAIL_ALREADY_VERIFIED'
  | 'OTP_INVALID'
  | 'OTP_EXPIRED'
  | 'RATE_LIMITED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'PASSWORD_REUSED'
  | 'USER_NOT_FOUND'
  | 'ALREADY_ADMIN'
  | 'NOT_ADMIN'
  | 'INTERNAL_ERROR'
export type UserApiError = {
  code: UserApiErrorCode
  message: string
  fieldErrors?: Partial<Record<UserField, string>>
}
