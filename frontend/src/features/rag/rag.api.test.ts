/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-11-10 to 2026-11-11
 * Scope (AI-29): Generated manifests, secret wiring and service changes to deploy the AI assistant and RAG services.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authenticatedFetch } from '../auth/auth.fetch'
import { askRag } from './rag.api'

vi.mock('../auth/auth.fetch', () => ({ authenticatedFetch: vi.fn() }))

describe('RAG API', () => {
  beforeEach(() => { vi.mocked(authenticatedFetch).mockReset() })

  it('asks the question as the signed-in user', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(new Response(JSON.stringify({ answer: 'Yes.' }), { status: 200 }))

    await expect(askRag('How do credits work?')).resolves.toEqual({ answer: 'Yes.' })

    const [url, init] = vi.mocked(authenticatedFetch).mock.calls[0]
    expect(String(url)).toMatch(/\/query$/)
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify({ query: 'How do credits work?', top_k: 5 }) })
  })

  it('reports an unavailable assistant', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(new Response('{"detail":"Anthropic API key is not configured"}', { status: 503 }))
    await expect(askRag('Hi')).rejects.toThrow('The assistant is unavailable right now.')
  })
})
