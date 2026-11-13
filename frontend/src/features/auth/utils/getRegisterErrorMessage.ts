import { AuthRequestError } from '../lib/authRequest'

export const getRegisterErrorMessage = (error: unknown): string | undefined => {
  if (error == null) {
    return undefined
  }

  if (error instanceof AuthRequestError) {
    if (error.status === undefined) {
      return 'Unable to reach the server. Please try again.'
    }

    const { status, detail } = error

    if (status === 400 && detail === 'Please use your NUS email address.') {
      return detail
    }

    if (status === 400 && detail === 'User already exists with this email') {
      return 'An account with this email already exists.'
    }

    if (status === 400) {
      return 'Please check your registration details and try again.'
    }
  }

  return 'Unable to create your account. Please try again.'
}
