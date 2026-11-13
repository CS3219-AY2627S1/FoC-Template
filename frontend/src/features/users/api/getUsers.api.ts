import { axiosClient } from '#/lib/axiosClient'
import type { UserListParams, UserPage } from '../types/user.types'

export const getUsers = async (params: UserListParams) => {
  const { data } = await axiosClient.get<UserPage>('/users', { params })
  return data
}
