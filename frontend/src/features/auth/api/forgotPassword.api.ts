import { authRequest } from '../lib/authRequest'

export const requestPasswordReset = (email: string) =>
  authRequest('/auth/password-reset/request', { email })

export const resetPassword = (values: { token: string; newPassword: string }) =>
  authRequest('/auth/password-reset/confirm', values)
