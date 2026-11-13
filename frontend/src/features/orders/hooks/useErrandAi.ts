import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { getApiErrorCode } from '#/lib/httpErrors'
import {
  getCurrentUserId,
  subscribeSession,
} from '#/features/auth/lib/accessTokenStore'
import { chatWithErrandAi, transcribeErrandAudio } from '../api/errandAi.api'
import type {
  AiChatRequest,
  AiChatResponse,
  AiMessage,
  ErrandDraft,
} from '../schemas/errandAi.schema'

function historyWithinLimit(messages: Array<AiMessage>) {
  const history: Array<AiMessage> = []
  let size = 0
  for (const message of messages.slice(-20).reverse()) {
    if (size + message.content.length > 20_000) break
    history.unshift(message)
    size += message.content.length
  }
  return history
}

export function useErrandAi(initialDraft: ErrandDraft) {
  const [messages, setMessages] = useState<Array<AiMessage>>([])
  const [draft, setDraft] = useState(initialDraft)
  const [response, setResponse] = useState<AiChatResponse | null>(null)
  const [error, setError] = useState('')
  const [failed, setFailed] = useState<AiChatRequest | null>(null)
  const [busy, setBusy] = useState(false)
  const active = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  const owner = useRef(getCurrentUserId())
  const chat = useMutation({
    mutationFn: ({
      input,
      signal,
    }: {
      input: AiChatRequest
      signal: AbortSignal
    }) => chatWithErrandAi(input, signal),
    retry: false,
    gcTime: 0,
    networkMode: 'always',
  })
  const transcription = useMutation({
    mutationFn: ({ file, signal }: { file: File; signal: AbortSignal }) =>
      transcribeErrandAudio(file, signal),
    retry: false,
    gcTime: 0,
    networkMode: 'always',
  })

  useEffect(() => {
    mounted.current = true
    const unsubscribe = subscribeSession(() => {
      if (getCurrentUserId() !== owner.current) active.current?.abort()
    })
    return () => {
      mounted.current = false
      active.current?.abort()
      unsubscribe()
    }
  }, [])

  const valid = (controller: AbortController) =>
    mounted.current &&
    !controller.signal.aborted &&
    getCurrentUserId() === owner.current
  const send = async (
    message: string,
    selectedSupplierId?: string,
    retry = false,
  ) => {
    if (active.current || !message.trim() || message.trim().length > 2000)
      return false
    const input =
      retry && failed
        ? failed
        : {
            message: message.trim(),
            history: historyWithinLimit(messages),
            draft,
            selectedSupplierId,
          }
    const controller = new AbortController()
    active.current = controller
    setBusy(true)
    setError('')
    if (!retry)
      setMessages((previous) => [
        ...previous,
        { role: 'user', content: input.message },
      ])
    try {
      const result = await chat.mutateAsync({
        input,
        signal: controller.signal,
      })
      if (!valid(controller)) return false
      setDraft(result.draft)
      setResponse(result)
      setMessages((previous) => [
        ...previous,
        { role: 'assistant', content: result.message },
      ])
      setFailed(null)
      return true
    } catch (failure) {
      if (valid(controller)) {
        setFailed(input)
        setError(
          getApiErrorCode(failure) === 'AI_UNAVAILABLE'
            ? 'AI assistance is currently unavailable. You can continue filling the form.'
            : 'The assistant could not reply. Retry or continue filling the form.',
        )
      }
      return false
    } finally {
      active.current = null
      if (mounted.current) setBusy(false)
    }
  }
  const transcribe = async (file: File) => {
    if (active.current) return null
    const controller = new AbortController()
    active.current = controller
    setBusy(true)
    setError('')
    try {
      const text = await transcription.mutateAsync({
        file,
        signal: controller.signal,
      })
      return valid(controller) ? text : null
    } catch {
      if (valid(controller))
        setError(
          'Could not transcribe the recording. Try again or type your message.',
        )
      return null
    } finally {
      active.current = null
      if (mounted.current) setBusy(false)
    }
  }
  const restart = (nextDraft: ErrandDraft) => {
    if (active.current) return false
    setMessages([])
    setDraft(nextDraft)
    setResponse(null)
    setError('')
    setFailed(null)
    chat.reset()
    transcription.reset()
    return true
  }
  return {
    messages,
    draft,
    response,
    busy,
    error,
    failed,
    send,
    transcribe,
    restart,
  }
}
