import { decodeAccessToken } from '../utils/decodeAccessToken'

let accessToken: string | null = null
const listeners = new Set<() => void>()

export const getAccessToken = () => accessToken
export const getCurrentUserId = () => decodeAccessToken(accessToken)?.sub
export const subscribeSession = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const setAccessToken = (token: string | null) => {
  if (accessToken === token) return
  accessToken = token
  listeners.forEach((listener) => listener())
}
