/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
 * Scope: Token storage module implementing the author's sessionStorage decision.
 * Author review: Reviewed and approved by @t-leongchuan
 */

// The only module that touches token storage. Author decision: sessionStorage
// (per tab, survives refresh); switch to localStorage here if the team prefers.
const storage: Storage = window.sessionStorage

const TOKEN_KEY = 'foc.accessToken'

export function getToken(): string | null {
  return storage.getItem(TOKEN_KEY)
}

export function saveToken(token: string): void {
  storage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  storage.removeItem(TOKEN_KEY)
}
