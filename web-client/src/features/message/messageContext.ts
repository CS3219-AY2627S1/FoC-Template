import { createContext, useContext } from 'react'
import type { Socket } from 'socket.io-client'
import type { Message } from '@/api/message/types'

export type MessageContextValue = {
  // Messages that arrived live since the page loaded. History comes from the message-service.
  received: Message[]
  // Set only while connected, so a component never emits into a dead socket.
  socket: Socket | null
}

export const MessageContext = createContext<MessageContextValue | null>(null)

export function useMessage() {
  const ctx = useContext(MessageContext)
  if (!ctx) throw new Error('useMessage must be used inside <MessageProvider>')
  return ctx
}
