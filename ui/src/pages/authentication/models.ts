export type SignInRequest = {
  email: string
  password: string
}

export type SignInResponse = {
  message: string
}

export type SignUpRequest = {
  username: string
  email: string
  password: string
}

export type SignUpResponse = {
  message: string
}

export type SignOutResponse = null
