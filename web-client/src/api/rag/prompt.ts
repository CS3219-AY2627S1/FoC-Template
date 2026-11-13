import { useMutation } from '@tanstack/react-query'
import { request } from '@/lib/http'

// Mirrors queryRequest and the answer of rag-service (controller/rag_controller.py). Change both together.

export type AssistantTurn = {
  role: 'user' | 'assistant'
  content: string
}

export type AssistantAnswer = {
  query: string
  response: string
}

type AskInput = {
  query: string
  // The earlier questions and answers, oldest first. The service keeps the last few.
  conversation: AssistantTurn[]
}

// Not cached: every question is asked once, and the overlay keeps the conversation itself.
export function useAskAssistant() {
  return useMutation({
    mutationFn: ({ query, conversation }: AskInput) =>
      request<AssistantAnswer>('rag', '/query/', { method: 'POST', body: { query, conversation } }),
  })
}
