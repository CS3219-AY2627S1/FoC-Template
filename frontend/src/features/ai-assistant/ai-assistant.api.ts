/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-11-10
 * Scope (AI-64): Generated the ai-assistant.api.ts file for the frontend, including API integration for drafting errands and error handling.
 * Author review: Code changes were checked and validated
 */


import { authenticatedFetch } from '../auth/auth.fetch'

const aiAssistantApiBaseUrl = (import.meta.env.VITE_AI_ASSISTANT_API_URL ?? '')
  .trim()
  .replace(/\/+$/, '')

export const AI_DRAFT_MESSAGE_MIN_LENGTH = 5
export const AI_DRAFT_MESSAGE_MAX_LENGTH = 1000

/** Response of `POST /errands/draft` on the AI Errand Assistant Service. */
export type AiErrandDraft = {
  supplier_id: string | null
  supplier_name: string | null
  required_item: string | null
  delivery_building_id: string | null
  delivery_building_name: string | null
  delivery_floor: string | null
  delivery_description: string | null
  expires_at: string | null
  historical_base_credit: number
  credit_value: number
  credit_reason: string
  completed_history_count: number
}

type FastApiError = {
  detail?: string | { msg?: string }[]
}

export class AiAssistantApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'AiAssistantApiError'
    this.status = status
  }
}

function errorMessage(status: number, body: FastApiError | null, retryAfter: string | null) {
  if (status === 401) return 'Your session has expired. Please sign in again.'
  if (status === 429) {
    return retryAfter
      ? `Too many requests. Please try again in ${retryAfter} seconds.`
      : 'Too many requests. Please try again shortly.'
  }
  if (typeof body?.detail === 'string') return body.detail
  if (Array.isArray(body?.detail) && body.detail[0]?.msg) return body.detail[0].msg
  return 'The assistant could not draft this errand. Please try again.'
}

export async function draftErrand(message: string, signal?: AbortSignal): Promise<AiErrandDraft> {
  let response: Response

  try {
    response = await authenticatedFetch(`${aiAssistantApiBaseUrl}/errands/draft`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new AiAssistantApiError('Could not connect to the AI Errand Assistant.', 0)
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as FastApiError | null
    throw new AiAssistantApiError(
      errorMessage(response.status, body, response.headers.get('Retry-After')),
      response.status,
    )
  }

  return (await response.json()) as AiErrandDraft
}
