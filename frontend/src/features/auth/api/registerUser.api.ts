import { authRequest } from '../lib/authRequest'
import type {
  RegisterUserRequest,
  UserProfileDto,
} from '#/features/auth/types/auth.types'

export const registerUser = async (
  request: RegisterUserRequest,
): Promise<UserProfileDto> => {
  const { name, email, password } = request

  return authRequest<UserProfileDto>('/auth/register', {
    name,
    email,
    password,
  })
}
