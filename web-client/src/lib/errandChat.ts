import { createContext, useContext } from 'react'
import type { ComponentType } from 'react'

// The chat of one errand is drawn by the message feature and shown on the errand page of the
// order feature. Features may not import each other, so src/app puts the chat component into this
// context and the errand page takes it from here.

export type ErrandChatProps = {
  orderId: string
  // The errand's current status, so the chat asks again whether it is open once the errand moves on.
  status: string
  title: string
}

export const ErrandChatContext = createContext<ComponentType<ErrandChatProps> | null>(null)

// null when no chat was provided, for example on a page outside the student app.
export function useErrandChatSlot() {
  return useContext(ErrandChatContext)
}
