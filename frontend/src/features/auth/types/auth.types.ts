import type { RegisterFormValues } from '#/features/auth/pages/RegisterPage/schemas/register.schema'
import type { LoginFormValues } from '#/features/auth/pages/LoginPage/schemas/login.schema'

export type LoginRequest = Pick<LoginFormValues, 'email' | 'password'>

export type AccessTokenResponse = {
  accessToken: string
  expiresAt: string
}

export type RegisterUserRequest = Pick<
  RegisterFormValues,
  'name' | 'email' | 'password'
>

export type UserProfileDto = {
  id: string
  email: string
  name: string
  phoneNumber?: string | null
  faculty?: string | null
  avatarUrl?: string | null
  roles: string[]
}
