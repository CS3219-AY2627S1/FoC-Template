import { useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  confirmEmailChange,
  resendVerification,
  verifyEmail,
} from '../api/emailVerification.api'
import { profileKey } from './useUserProfile'

export const useEmailVerification = (
  token?: string,
  purpose: 'registration' | 'email-change' = 'registration',
) => {
  const client = useQueryClient()
  const verification = useMutation({
    mutationFn: purpose === 'email-change' ? confirmEmailChange : verifyEmail,
    onSuccess: () => {
      if (purpose === 'email-change') {
        return client.invalidateQueries({
          queryKey: profileKey,
          refetchType: 'none',
        })
      }
    },
    retry: false,
    networkMode: 'always',
    gcTime: 0,
  })
  const resend = useMutation({
    mutationFn: resendVerification,
    retry: false,
    networkMode: 'always',
    gcTime: 0,
  })
  const startedLink = useRef<string | undefined>(undefined)
  const { mutate: confirm } = verification

  useEffect(() => {
    // A render or StrictMode effect replay must not consume the same link twice.
    const link = `${purpose}:${token}`
    if (token && startedLink.current !== link) {
      startedLink.current = link
      confirm(token)
    }
  }, [token, purpose, confirm])

  return { verification, resend }
}
