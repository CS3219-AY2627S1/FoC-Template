import { api } from "./client"

export type ApiUser = {
  id: string
  username: string
  firstName: string
  lastName: string
  email: string
  roles: string[]
  createdAt: string
}

export const login = (email: string, password: string) =>
  api<{ token: string }>("/users/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  })

export const register = (data: { firstName: string; lastName: string; username: string; email: string; password: string }) =>
  api<{ user: ApiUser }>("/users/register", {
    method: "POST",
    body: JSON.stringify(data),
  })

export const getMe = () => api<{ user: ApiUser }>("/users/me").then((r) => r.user)

export const logout = () => api<void>("/users/logout", { method: "POST" })