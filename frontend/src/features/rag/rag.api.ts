/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-11-10 to 2026-11-11
 * Scope (AI-29): Generated manifests, secret wiring and service changes to deploy the AI assistant and RAG services.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

import { authenticatedFetch } from '../auth/auth.fetch'

export type RagAnswer = { answer: string }

function apiUrl() {
  return (import.meta.env.VITE_RAG_API_URL ?? 'http://localhost:8005').trim().replace(/\/+$/, '')
}

// Signed-in users only: the service checks the access token (and authenticatedFetch refreshes it
// once if it has expired), so the Claude API behind it can't be used by anyone on the internet.
export async function askRag(question: string, signal?: AbortSignal): Promise<RagAnswer> {
  const response = await authenticatedFetch(`${apiUrl()}/query`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: question, top_k: 5 }),
    signal,
  })

  if (!response.ok) throw new Error('The assistant is unavailable right now.')
  return response.json() as Promise<RagAnswer>
}
