/**
 * AI Assistance Disclosure
 * Tool: Cursor (Composer)
 * Scope: Session flash for post-logout login success messages (survives RequireAuth redirect).
 * Author review: Cleared on read so the notice only shows once.
 */

const LOGIN_FLASH_KEY = 'foc.loginFlash'

export function setLoginFlash(message: string) {
  sessionStorage.setItem(LOGIN_FLASH_KEY, message)
}

export function consumeLoginFlash(): string | null {
  const message = sessionStorage.getItem(LOGIN_FLASH_KEY)
  if (message) {
    sessionStorage.removeItem(LOGIN_FLASH_KEY)
  }
  return message
}
