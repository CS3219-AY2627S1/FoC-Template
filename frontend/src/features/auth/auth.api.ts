/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-6.1-sol), 2026-11-08
 * Scope (AI-06): Implemented and tested the requested account initials menu.
 * Tool and date: OpenAI Codex (gpt-5.6-sol), 2026-10-14
 * Scope (AI-15): Implemented and tested the requested create-account UI.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 */

import type { LoginCredentials, LoginResponse, RegisterCredentials } from './auth.types'

export const userApiBaseUrl = (import.meta.env.VITE_USER_API_URL ?? '').trim().replace(/\/+$/, '')

type ProblemDetails = {
  detail?: string
  title?: string
}

export class AuthApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'AuthApiError'
    this.status = status
  }
}

async function authRequest(
  path: string,
  init: RequestInit,
  fallbackMessage: string,
): Promise<Response> {
  let response: Response

  try {
    response = await fetch(`${userApiBaseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...init.headers,
      },
    })
  } catch {
    throw new AuthApiError('Could not connect to the User Service.', 0)
  }

  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as ProblemDetails | null
    throw new AuthApiError(problem?.detail ?? problem?.title ?? fallbackMessage, response.status)
  }

  return response
}

export async function login(credentials: LoginCredentials): Promise<LoginResponse> {
  const response = await authRequest(
    '/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    },
    'The email or password is incorrect.',
  )

  return (await response.json()) as LoginResponse
}

export async function register(credentials: RegisterCredentials): Promise<void> {
  await authRequest(
    '/auth/register',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    },
    'Unable to create your account right now. Please try again.',
  )
}

export async function refreshSession(): Promise<LoginResponse> {
  const response = await authRequest(
    '/auth/refresh',
    { method: 'POST' },
    'Your session has expired. Please sign in again.',
  )

  return (await response.json()) as LoginResponse
}

export async function logout(accessToken: string): Promise<void> {
  await authRequest(
    '/auth/logout',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    'Unable to sign out from the User Service.',
  )
}
