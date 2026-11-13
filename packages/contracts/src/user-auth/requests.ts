export type RegisterRequest = { email: string; password: string; passwordConfirmation: string }
export type LoginRequest = { email: string; password: string }
export type ResendVerificationRequest = { email: string }
export type SubmitOtpAndLoginRequest = LoginRequest & { code: string }
export type ChangePasswordRequest = {
  currentPassword: string
  newPassword: string
  newPasswordConfirmation: string
}
export type PromoteUserToAdminRequest = { email: string }
export type DemoteAdminToUserRequest = { email: string }
