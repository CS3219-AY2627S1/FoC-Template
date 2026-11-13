import { axiosClient } from '#/lib/axiosClient'
import {
  aiCapabilitiesSchema,
  aiChatResponseSchema,
  transcriptionSchema,
} from '../schemas/errandAi.schema'
import type { AiChatRequest } from '../schemas/errandAi.schema'

const timeout = 45_000
export async function getErrandAiCapabilities(signal: AbortSignal) {
  const response = await axiosClient.get<unknown>('/orders/ai/capabilities', {
    signal,
    timeout: 15_000,
  })
  return aiCapabilitiesSchema.parse(response.data)
}

export async function chatWithErrandAi(
  input: AiChatRequest,
  signal: AbortSignal,
) {
  const response = await axiosClient.post<unknown>('/orders/ai/chat', input, {
    signal,
    timeout,
  })
  return aiChatResponseSchema.parse(response.data)
}
export async function transcribeErrandAudio(file: File, signal: AbortSignal) {
  const form = new FormData()
  form.append('file', file)
  const response = await axiosClient.post<unknown>(
    '/orders/ai/transcriptions',
    form,
    { signal, timeout },
  )
  return transcriptionSchema.parse(response.data).text
}
