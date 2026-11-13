import { axiosClient } from '#/lib/axiosClient'

export const getFaculties = async () => {
  const { data } = await axiosClient.get<string[]>('/users/faculties')
  return data
}
