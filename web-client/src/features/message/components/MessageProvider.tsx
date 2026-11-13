import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import { messageKeys } from '@/api/message/message'
import type { Message } from '@/api/message/types'
import { useCurrentUser } from '@/api/user/session'
import { MessageContext } from '../messageContext'

export function MessageProvider({ children }: { children: ReactNode }) {
  const userId = useCurrentUser().id
  const queryClient = useQueryClient()
  const [socket, setSocket] = useState<Socket | null>(null)
  const [received, setReceived] = useState<Message[]>([])

  useEffect(() => {
    // Through the gateway, so the session cookie goes along and the service checks it.
    const newSocket = io({ path: '/api/message/socket.io' })

    const onConnect = () => setSocket(newSocket)
    const onDisconnect = () => setSocket(null)
    const onReceiveMessage = (message: Message) => {
      setReceived((prev) => [...prev, message])
      // The unread count and last message in the inbox come from the service.
      void queryClient.invalidateQueries({ queryKey: messageKeys.conversations })
    }
    const onMessagesRead = () => void queryClient.invalidateQueries({ queryKey: messageKeys.all })

    newSocket.on('connect', onConnect)
    newSocket.on('disconnect', onDisconnect)
    newSocket.on('receiveMessage', onReceiveMessage)
    newSocket.on('messagesRead', onMessagesRead)

    return () => {
      newSocket.off('connect', onConnect)
      newSocket.off('disconnect', onDisconnect)
      newSocket.off('receiveMessage', onReceiveMessage)
      newSocket.off('messagesRead', onMessagesRead)
      newSocket.close()
      setSocket(null)
      setReceived([])
    }
  }, [userId, queryClient])

  const value = useMemo(() => ({ received, socket }), [received, socket])

  return <MessageContext.Provider value={value}>{children}</MessageContext.Provider>
}
