import { authRequest } from '../lib/authRequest'

export const verifyEmail = (token: string) =>
  authRequest('/auth/email-verification/confirm', { token })

export const resendVerification = (email: string) =>
  authRequest('/auth/email-verification/resend', { email })

export const confirmEmailChange = (token: string) =>
  authRequest('/users/email-change/confirm', { token })
