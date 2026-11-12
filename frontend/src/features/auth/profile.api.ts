/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-6.1-sol), 2026-11-08
 * Scope (AI-06): Implemented and tested the requested account initials menu.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Scope: Implementation, refactoring, and test assistance for the recorded frontend work.
 */
import { userApiBaseUrl } from './auth.api'
import { authenticatedFetch } from './auth.fetch'

export async function getProfileName(signal: AbortSignal): Promise<string | null> {
  const response = await authenticatedFetch(`${userApiBaseUrl}/api/v1/profiles/me`, {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!response.ok) return null

  const profile = await response.json() as { name?: unknown } | null
  return typeof profile?.name === 'string' ? profile.name.trim() || null : null
}

export type UserProfile = { name: string; email: string }

export async function getProfile(profileId: string, signal?: AbortSignal): Promise<UserProfile> {
  const response = await authenticatedFetch(
    `${userApiBaseUrl}/api/v1/profiles/${encodeURIComponent(profileId)}`,
    { headers: { Accept: 'application/json' }, signal },
  )
  if (!response.ok) throw new Error('Unable to load user profile.')
  return await response.json() as UserProfile
}
