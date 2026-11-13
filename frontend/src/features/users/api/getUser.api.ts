import { axiosClient } from '#/lib/axiosClient'
import type { User } from '../types/user.types'

export const getUser = async (id: string) => {
  const { data } = await axiosClient.get<User>(`/users/${id}`)
  return data
}
