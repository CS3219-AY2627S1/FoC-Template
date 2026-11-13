import { axiosClient } from '#/lib/axiosClient'
import type { UpdateUserRequest, User } from '../types/user.types'

export const updateUser = async (id: string, request: UpdateUserRequest) => {
  const { data } = await axiosClient.patch<User>(`/users/${id}`, request)
  return data
}
