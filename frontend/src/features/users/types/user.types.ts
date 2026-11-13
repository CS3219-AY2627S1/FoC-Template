import type { Page } from '#/types/page.types'

export type UserRole = 'USER' | 'ADMIN'

export type User = {
  id: string
  email: string
  name: string
  roles: UserRole[]
  phoneNumber: string | null
  faculty: string | null
  avatarUrl: string | null
  createdAt: string
  updatedAt: string
}

export type UserPage = Page<User>

export type UserListParams = {
  page: number
  size: number
  search: string
  role?: UserRole
  faculty?: string
  sort:
    | 'name,asc'
    | 'name,desc'
    | 'email,asc'
    | 'email,desc'
    | 'createdAt,asc'
    | 'createdAt,desc'
    | 'updatedAt,asc'
    | 'updatedAt,desc'
}

export type UpdateUserRequest = Pick<User, 'name' | 'email' | 'roles'> & {
  phoneNumber: string
  faculty: string
}
