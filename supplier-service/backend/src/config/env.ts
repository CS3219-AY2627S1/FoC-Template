import 'dotenv/config'

const positiveInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export type SupplierEnv = {
  port: number
  userApiUrl: string
  userServiceInternalToken: string
  userApiTimeoutMs: number
  internalServiceToken: string
  timezone: string
}

export function getEnv(): SupplierEnv {
  return {
    port: positiveInteger(process.env.PORT, 3000),
    userApiUrl: process.env.USER_API_URL ?? 'http://user-api:3000',
    userServiceInternalToken:
      process.env.USER_SERVICE_INTERNAL_TOKEN ?? 'local-internal-user-service-token',
    userApiTimeoutMs: positiveInteger(process.env.USER_API_TIMEOUT, 5000),
    internalServiceToken:
      process.env.INTERNAL_SUPPLIER_SERVICE_TOKEN ?? 'local-internal-supplier-service-token',
    timezone: process.env.SUPPLIER_TIMEZONE ?? 'Asia/Singapore',
  }
}
