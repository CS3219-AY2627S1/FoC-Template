import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import { getAccessToken } from '#/features/auth/lib/accessTokenStore'
import { refreshAccessToken } from '#/features/auth/lib/refreshAccessToken'

export const connectRealtime = (signal: AbortSignal): Socket => {
  const socket = io({ autoConnect: false, auth: { token: getAccessToken() } })

  const onConnectError = async () => {
    // Network trouble: socket.io keeps retrying by itself. Only a rejected
    // login (inactive socket) needs a fresh token and a manual reconnect.
    if (socket.active) return
    try {
      const token = await refreshAccessToken()
      if (signal.aborted || !token) return
      socket.auth = { token }
      socket.connect()
    } catch {}
  }
  const onAbort = () => {
    socket.off('connect_error', onConnectError)
    socket.disconnect()
  }

  socket.on('connect_error', onConnectError)

  if (signal.aborted) {
    onAbort()
  } else {
    signal.addEventListener('abort', onAbort, { once: true })
    socket.connect()
  }
  return socket
}
