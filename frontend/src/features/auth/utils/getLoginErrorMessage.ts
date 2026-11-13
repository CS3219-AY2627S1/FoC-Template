import { AuthRequestError } from '../lib/authRequest'

export const getLoginErrorMessage = (error: unknown): string | undefined => {
  if (error == null) {
    return undefined
  }

  if (error instanceof AuthRequestError) {
    if (error.status === undefined) {
      return 'Unable to reach the server. Please try again.'
    }
    if (error.status === 401) {
      return 'Incorrect email or password.'
    }
    if (error.status === 403) {
      return 'Please verify your email before logging in.'
    }
    if (error.status === 400) {
      return 'Please check your login details and try again.'
    }
  }

  return 'Unable to log in. Please try again.'
}
