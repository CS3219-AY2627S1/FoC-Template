import { expect, it, vi } from 'vitest'
import { io } from 'socket.io-client'
import { refreshAccessToken } from '#/features/auth/lib/refreshAccessToken'
import { connectRealtime } from './realtime'

vi.mock('socket.io-client', () => ({ io: vi.fn() }))
vi.mock('#/features/auth/lib/accessTokenStore', () => ({
  getAccessToken: () => 'initial-token',
}))
vi.mock('#/features/auth/lib/refreshAccessToken', () => ({
  refreshAccessToken: vi.fn(),
}))

it('does not reconnect when a pending refresh resolves after unmount cleanup', async () => {
  const socket = {
    auth: { token: 'initial-token' },
    on: vi.fn(),
    off: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  }
  vi.mocked(io).mockReturnValue(socket as unknown as ReturnType<typeof io>)
  let resolveRefresh!: (token: string) => void
  vi.mocked(refreshAccessToken).mockReturnValue(
    new Promise((resolve) => {
      resolveRefresh = resolve
    }),
  )
  const controller = new AbortController()
  connectRealtime(controller.signal)
  socket.connect.mockClear()

  const pending = socket.on.mock.calls[0][1]()
  controller.abort()
  resolveRefresh('late-token')
  await pending

  expect(socket.disconnect).toHaveBeenCalledOnce()
  expect(socket.connect).not.toHaveBeenCalled()
  expect(socket.auth).toEqual({ token: 'initial-token' })
})

it('leaves temporary connection failures to socket.io instead of refreshing the token', async () => {
  const socket = {
    active: true,
    auth: { token: 'initial-token' },
    on: vi.fn(),
    off: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  }
  vi.mocked(io).mockReturnValue(socket as unknown as ReturnType<typeof io>)
  vi.mocked(refreshAccessToken).mockClear()
  connectRealtime(new AbortController().signal)
  socket.connect.mockClear()

  await socket.on.mock.calls[0][1]()

  expect(refreshAccessToken).not.toHaveBeenCalled()
  expect(socket.connect).not.toHaveBeenCalled()
})
