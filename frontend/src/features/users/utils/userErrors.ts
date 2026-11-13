import { isAxiosError } from 'axios'

export const getUserErrorMessage = (error: unknown) => {
  if (isAxiosError<{ message?: string; detail?: string }>(error)) {
    if (error.response?.data.message) return error.response.data.message
    if (error.response?.data.detail) return error.response.data.detail
    if (error.response?.status === 401) return 'Please log in as an admin.'
    if (error.response?.status === 403)
      return 'Only admins can view and edit users.'
    if (error.response?.status === 404) return 'User not found.'
  }
  return 'Something went wrong. Please try again.'
}
