import { axiosClient } from '#/lib/axiosClient'
import type { UserProfileDto } from '../types/auth.types'

export type UpdateProfileRequest = {
  name: string
  phoneNumber: string | null
  faculty: string | null
}

export const getUserProfile = async (signal?: AbortSignal) => {
  const { data } = await axiosClient.get<UserProfileDto>('/users/me', {
    signal,
  })
  return data
}

export const updateUserProfile = async (request: UpdateProfileRequest) => {
  const { data } = await axiosClient.put<UserProfileDto>('/users/me', request)
  return data
}

export const changePassword = async (request: {
  currentPassword: string
  newPassword: string
}) => {
  await axiosClient.put('/users/me/password', request)
}

export const requestEmailChange = async (email: string) => {
  await axiosClient.post('/users/me/email-change', { email })
}

export const uploadAvatar = async (file: File) => {
  const body = new FormData()
  body.append('file', file)
  const { data } = await axiosClient.put<UserProfileDto>(
    '/users/me/avatar',
    body,
  )
  return data
}

export const removeAvatar = async () => {
  await axiosClient.delete('/users/me/avatar')
}
