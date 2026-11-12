/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Scope: Implementation, refactoring, and test assistance for the recorded frontend work.
 */
import { useEffect, useState } from 'react'
import { getMessage } from './chat.api'

const cache = new Map<string, string>()
const pending = new Map<string, Promise<string>>()

export function loadChatPreview(conversationId: string, messageId: string) {
  const cached = cache.get(messageId)
  if (cached !== undefined) return Promise.resolve(cached)
  const existing = pending.get(messageId)
  if (existing) return existing
  const request = getMessage(conversationId, messageId).then((message) => {
    cache.set(messageId, message.content)
    pending.delete(messageId)
    return message.content
  }, (error) => {
    pending.delete(messageId)
    throw error
  })
  pending.set(messageId, request)
  return request
}

export function useChatPreview(conversationId?: string, messageId?: string) {
  const [content, setContent] = useState<string | null>(() => messageId ? cache.get(messageId) ?? null : null)
  useEffect(() => {
    if (!conversationId || !messageId) return
    let active = true
    void loadChatPreview(conversationId, messageId).then((value) => { if (active) setContent(value) }).catch(() => {})
    return () => { active = false }
  }, [conversationId, messageId])
  return content
}
