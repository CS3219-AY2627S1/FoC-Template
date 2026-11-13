import { isAxiosError } from 'axios'

export const getApiErrorCode = (error: unknown): string | undefined =>
  isAxiosError<{ code?: string } | null | undefined>(error)
    ? error.response?.data?.code
    : undefined
