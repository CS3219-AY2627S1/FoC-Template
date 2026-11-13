import { useMutation } from '@tanstack/react-query'
import { requestPasswordReset, resetPassword } from '../api/forgotPassword.api'

export const useForgotPassword = () =>
  useMutation({
    mutationFn: requestPasswordReset,
    retry: false,
    networkMode: 'always',
    gcTime: 0,
  })

export const useResetPassword = () =>
  useMutation({
    mutationFn: resetPassword,
    retry: false,
    networkMode: 'always',
    gcTime: 0,
  })
