import { authRequest } from '../lib/authRequest'

export const logoutUser = (): Promise<void> =>
  authRequest('/auth/logout', undefined, 10_000)
