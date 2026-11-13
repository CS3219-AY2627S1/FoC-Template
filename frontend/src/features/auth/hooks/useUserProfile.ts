import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  changePassword,
  getUserProfile,
  removeAvatar,
  requestEmailChange,
  updateUserProfile,
  uploadAvatar,
} from '../api/userProfile.api'
import type { UserProfileDto } from '../types/auth.types'
import { useSession } from './useSession'

export const profileKey = ['current-user', 'profile'] as const

export const useUserProfile = () => {
  const { userId } = useSession()
  return useQuery({
    queryKey: profileKey,
    queryFn: ({ signal }) => getUserProfile(signal),
    enabled: !!userId,
    refetchInterval: 5 * 60_000,
  })
}

export const useProfileActions = () => {
  const client = useQueryClient()
  const saved = (profile: UserProfileDto) =>
    client.setQueryData(profileKey, profile)
  const update = useMutation({
    mutationFn: updateUserProfile,
    onSuccess: saved,
    retry: false,
    networkMode: 'always',
    gcTime: 0,
  })
  const password = useMutation({
    mutationFn: changePassword,
    retry: false,
    networkMode: 'always',
    gcTime: 0,
  })
  const upload = useMutation({
    mutationFn: uploadAvatar,
    onSuccess: saved,
    retry: false,
    networkMode: 'always',
    gcTime: 0,
  })
  const remove = useMutation({
    mutationFn: removeAvatar,
    retry: false,
    networkMode: 'always',
    onSuccess: () => {
      client.setQueryData<UserProfileDto>(profileKey, (profile) =>
        profile ? { ...profile, avatarUrl: null } : profile,
      )
    },
  })
  return { update, password, upload, remove }
}

export const useEmailChange = () =>
  useMutation({
    mutationFn: requestEmailChange,
    retry: false,
    networkMode: 'always',
    gcTime: 0,
  })
