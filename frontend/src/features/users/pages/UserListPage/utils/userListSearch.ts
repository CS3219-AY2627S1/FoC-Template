import type { UserListParams, UserRole } from '../../../types/user.types'

export type UserListSearch = {
  q?: string
  role?: UserRole
  faculty?: string
  sort?: UserListParams['sort']
  page?: number
}

const sorts: UserListParams['sort'][] = [
  'name,asc',
  'name,desc',
  'email,asc',
  'email,desc',
  'createdAt,asc',
  'createdAt,desc',
  'updatedAt,asc',
  'updatedAt,desc',
]

export const validateUserListSearch = (
  search: Record<string, unknown>,
): UserListSearch => {
  const q = typeof search.q === 'string' ? search.q.trim() : ''
  const role =
    search.role === 'USER' || search.role === 'ADMIN' ? search.role : undefined
  const faculty =
    typeof search.faculty === 'string' ? search.faculty.trim() : ''
  const sort = sorts.find((value) => value === search.sort)
  const page = Number(search.page)

  return {
    q: q || undefined,
    role,
    faculty: faculty || undefined,
    sort: sort === 'name,asc' ? undefined : sort,
    page: Number.isInteger(page) && page > 1 ? page : undefined,
  }
}

export const getUserListParams = (search: UserListSearch): UserListParams => ({
  page: (search.page ?? 1) - 1,
  size: 20,
  search: search.q ?? '',
  role: search.role,
  faculty: search.faculty,
  sort: search.sort ?? 'name,asc',
})
