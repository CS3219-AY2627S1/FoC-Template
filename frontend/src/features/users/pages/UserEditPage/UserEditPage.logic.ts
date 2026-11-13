import type { User, UserRole } from '../../types/user.types'
import type { UserFormValues } from '../../schemas/user.schema'

export const getUserFormValues = (user: User): UserFormValues => ({
  name: user.name,
  email: user.email,
  roles: user.roles,
  phoneNumber: user.phoneNumber ?? '',
  faculty: user.faculty ?? '',
})

export const toggleUserRole = (
  roles: UserRole[],
  role: UserRole,
  checked: boolean,
): UserRole[] => {
  if (!checked) {
    return roles.filter((currentRole) => currentRole !== role)
  }
  return [...roles, role]
}
