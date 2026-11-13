import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { setAccessToken } from '#/features/auth/lib/accessTokenStore'
import { connectRealtime } from '#/lib/realtime'
import * as api from '../api/orders.api'
import { ErrandChat, timeLabel } from '../components/ErrandChat/ErrandChat'
import { chatRefetchInterval, keepLinks } from '../hooks/useErrandChat'
import { orderFixture } from './orderFixtures'
import type { Chat, Errand, ErrandMessage } from '../types/errand.types'

vi.mock('#/lib/realtime', () => ({ connectRealtime: vi.fn() }))
vi.mock('../api/orders.api', () => ({
  getChat: vi.fn(),
  sendMessage: vi.fn(),
  sendChatFile: vi.fn(),
  markChatRead: vi.fn(),
}))

// tests trigger the events directly
const handlers = new Map<string, (payload?: unknown) => void>()
const socket = {
  on: vi.fn((event: string, handler: (payload?: unknown) => void) =>
    handlers.set(event, handler),
  ),
  off: vi.fn(),
}
const push = (event: string, payload?: unknown) =>
  act(() => handlers.get(event)?.(payload))

const accepted = (overrides: Partial<Errand> = {}) =>
  orderFixture({
    status: 'ACCEPTED',
    courier: { id: 'courier', name: 'Sam' },
    ...overrides,
  })

const at = (minute: number) =>
  new Date(Date.UTC(2030, 0, 1, 8, minute)).toISOString()
const message = (
  id: string,
  senderId: string,
  body: string | null,
  minute = 0,
  attachment: ErrandMessage['attachment'] = null,
): ErrandMessage => ({
  id,
  errandId: accepted().id,
  senderId,
  body,
  attachment,
  sentAt: at(minute),
})
const chat = (messages: Array<ErrandMessage>, reads: Chat['reads'] = []) => ({
  messages,
  reads,
})
const signIn = (userId: string, roles = ['USER']) =>
  setAccessToken(
    `header.${btoa(JSON.stringify({ sub: userId, roles }))}.signature`,
  )
const setup = (order: Errand) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const view = render(
    <QueryClientProvider client={client}>
      <ErrandChat order={order} />
    </QueryClientProvider>,
  )
  return { ...view, client, user: userEvent.setup() }
}

beforeEach(() => {
  handlers.clear()
  vi.mocked(connectRealtime).mockReturnValue(socket as never)
  vi.mocked(api.getChat).mockResolvedValue(
    chat([message('m1', 'courier', 'On my way to the cafe', 1)]),
  )
  vi.mocked(api.markChatRead).mockResolvedValue()
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(document, 'hasFocus').mockReturnValue(true) // chat is focused
  signIn('requester')
})
afterEach(() => {
  cleanup()
  setAccessToken(null)
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

it('shows the conversation and sends with Enter', async () => {
  vi.mocked(api.sendMessage).mockImplementation(async (_errand, sent) =>
    message(sent.id, 'requester', sent.body, 2),
  )
  const { user } = setup(accepted())
  expect(
    screen.getByRole('heading', { name: 'Chat with Sam' }),
  ).toBeInTheDocument()
  await screen.findByText('On my way to the cafe')

  const box = screen.getByRole('textbox', { name: 'Message' })
  await user.type(box, '  Less ice please  {Enter}')

  expect(api.sendMessage).toHaveBeenCalledExactlyOnceWith(accepted().id, {
    id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    body: 'Less ice please',
  })
  const mine = await screen.findByText('Less ice please')
  expect(mine.closest('[data-mine]')).toHaveAttribute('data-mine', 'true')
  expect(box).toHaveValue('')
})

it('shows a time label only at the start and after a quiet gap', async () => {
  vi.mocked(api.getChat).mockResolvedValue(
    chat([
      message('m1', 'courier', 'On my way', 0),
      message('m2', 'courier', 'Queue is long', 1),
      message('m3', 'requester', 'Thanks', 3),
      message('m4', 'courier', 'Here now', 20),
    ]),
  )
  const { container } = setup(accepted())
  await screen.findByText('Here now')
  const labels = [...container.querySelectorAll('time')]
  expect(labels.map((label) => label.getAttribute('dateTime'))).toEqual([
    at(0),
    at(20),
  ])
  // sender name is shown once per group (the time group)
  expect(screen.getAllByText('Sam')).toHaveLength(2)
})

it('labels times like a chat app: today, yesterday, then the date', () => {
  const now = new Date('2030-01-02T08:00:00Z')
  expect(timeLabel('2030-01-02T03:05:00Z', now)).toMatch(/^11:05\s?am$/i)
  expect(timeLabel('2030-01-01T03:05:00Z', now)).toMatch(
    /^Yesterday 11:05\s?am$/i,
  )
  expect(timeLabel('2029-12-25T03:05:00Z', now)).toMatch(/25 Dec/)
})

it('does not send on Shift+Enter or while an input method is composing', async () => {
  const { user } = setup(accepted())
  const box = await screen.findByRole('textbox', { name: 'Message' })
  await user.type(box, 'line one{Shift>}{Enter}{/Shift}line two')
  expect(box).toHaveValue('line one\nline two')
  fireEvent.keyDown(box, { key: 'Enter', isComposing: true })
  expect(api.sendMessage).not.toHaveBeenCalled()
})

it('shows messages pushed by the realtime service, once each', async () => {
  setup(accepted())
  await screen.findByText('On my way to the cafe')
  expect(connectRealtime).toHaveBeenCalledOnce()

  const pushed = {
    id: 'm2',
    errandId: accepted().id,
    senderId: 'courier',
    body: 'Queue is long',
    attachmentType: null,
    sentAt: at(3),
  }
  push('errand.message', pushed)
  push('errand.message', pushed)
  push('errand.message', {
    ...pushed,
    id: 'm3',
    errandId: 'other',
    body: 'Wrong chat',
  })

  await screen.findByText('Queue is long')
  expect(screen.getAllByText('Queue is long')).toHaveLength(1)
  expect(screen.queryByText('Wrong chat')).not.toBeInTheDocument()

  // A pushed photo has no link yet, so the conversation is fetched again.
  vi.mocked(api.getChat).mockClear()
  push('errand.message', {
    ...pushed,
    id: 'm4',
    body: null,
    attachmentType: 'IMAGE',
  })
  await vi.waitFor(() => expect(api.getChat).toHaveBeenCalledOnce())
})

it('tells the other person what has been seen, and shows Seen on mine', async () => {
  vi.mocked(api.getChat).mockResolvedValue(
    chat([
      message('m1', 'courier', 'On my way', 1),
      message('m2', 'requester', 'Less ice please', 2),
      message('m3', 'requester', 'And a straw', 3),
    ]),
  )
  setup(accepted())
  // mark the latest msg as read
  await vi.waitFor(() =>
    expect(api.markChatRead).toHaveBeenCalledExactlyOnceWith(
      accepted().id,
      'm1',
    ),
  )
  expect(screen.queryByText('Seen')).not.toBeInTheDocument()

  // move the "seen" to the place of the lastest msg
  push('errand.read', {
    errandId: accepted().id,
    readerId: 'courier',
    lastReadAt: at(2),
  })
  const seen = await screen.findByText('Seen')
  expect(seen.closest('[data-mine]')).toHaveTextContent('Less ice please')
  push('errand.read', {
    errandId: accepted().id,
    readerId: 'courier',
    lastReadAt: at(3),
  })
  await vi.waitFor(() =>
    expect(screen.getByText('Seen').closest('[data-mine]')).toHaveTextContent(
      'And a straw',
    ),
  )
  expect(api.markChatRead).toHaveBeenCalledOnce()
})

it('only counts messages as seen while the chat is really being looked at', async () => {
  vi.mocked(document.hasFocus).mockReturnValue(false)
  let reportVisibility!: (onScreen: boolean) => void
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(
        callback: (entries: Array<{ isIntersecting: boolean }>) => void,
      ) {
        reportVisibility = (onScreen) =>
          callback([{ isIntersecting: onScreen }])
      }
      observe() {}
      disconnect() {}
    },
  )
  setup(accepted())
  await screen.findByText('On my way to the cafe')
  expect(api.markChatRead).not.toHaveBeenCalled()

  // back to the window, but the chat is scrolled out of view
  act(() => reportVisibility(false))
  vi.mocked(document.hasFocus).mockReturnValue(true)
  act(() => {
    window.dispatchEvent(new Event('focus'))
  })
  expect(api.markChatRead).not.toHaveBeenCalled()

  // scroll the chat to the view
  act(() => reportVisibility(true))
  await vi.waitFor(() =>
    expect(api.markChatRead).toHaveBeenCalledExactlyOnceWith(
      accepted().id,
      'm1',
    ),
  )
  vi.unstubAllGlobals()
})

it('sends photos and videos, previewing them while they upload', async () => {
  let finish!: (value: ErrandMessage) => void
  vi.mocked(api.sendChatFile).mockImplementation(
    (_errand, id) =>
      new Promise((resolve) => {
        finish = () =>
          resolve(
            message(id, 'requester', null, 2, {
              type: 'IMAGE',
              url: 'https://files.test/photo.jpg',
              expiresAt: '2099-01-01T00:00:00Z',
            }),
          )
      }),
  )
  const { user } = setup(accepted())
  await screen.findByText('On my way to the cafe')
  const input = screen.getByLabelText('Photo or video')

  // Too big, or not a supported type: refused before uploading
  await user.upload(
    input,
    new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'long.mp4', {
      type: 'video/mp4',
    }),
  )
  expect(screen.getByText('Videos can be up to 20 MB.')).toBeInTheDocument()
  expect(api.sendChatFile).not.toHaveBeenCalled()

  const photo = new File(['png'], 'photo.png', { type: 'image/png' })
  await user.upload(input, photo)
  expect(screen.getByRole('img', { name: 'Photo' })).toHaveAttribute(
    'src',
    'blob:preview',
  )
  expect(screen.getByText('Sending…')).toBeInTheDocument()
  expect(api.sendChatFile).toHaveBeenCalledExactlyOnceWith(
    accepted().id,
    expect.stringMatching(/^[0-9a-f-]{36}$/),
    photo,
  )
  await act(async () => finish(undefined as never))
  await vi.waitFor(() =>
    expect(screen.getByRole('img', { name: 'Photo' })).toHaveAttribute(
      'src',
      'https://files.test/photo.jpg',
    ),
  )
  expect(screen.queryByText('Sending…')).not.toBeInTheDocument()
})

it('keeps renewing photo and video links after the chat has closed', () => {
  const photo = message('m1', 'courier', null, 1, {
    type: 'IMAGE',
    url: 'https://files.test/a.jpg',
    expiresAt: '2099-01-01T00:00:00Z',
  })
  const text = message('m2', 'courier', 'Thanks', 2)
  // Open: a slow safety net for missed messages.
  expect(chatRefetchInterval(true, chat([text]))).toBe(30_000)
  // Closed: only while there are links that will expire.
  expect(chatRefetchInterval(false, chat([text]))).toBe(false)
  expect(chatRefetchInterval(false, chat([text, photo]))).toBe(60_000)
  expect(chatRefetchInterval(false, undefined)).toBe(false)
})

it('swaps a file link only when it is close to expiring', () => {
  const link = (url: string, minutesLeft: number) =>
    message('m1', 'courier', null, 1, {
      type: 'VIDEO',
      url,
      expiresAt: new Date(Date.now() + minutesLeft * 60_000).toISOString(),
    })
  const fresh = chat([link('https://files.test/new.mp4', 10)])
  // Still valid for a while: kept, so the video does not reload.
  expect(
    keepLinks(chat([link('https://files.test/old.mp4', 5)]), fresh),
  ).toEqual({
    ...fresh,
    messages: [link('https://files.test/old.mp4', 5)],
  })
  // About to expire: replaced by the new link.
  expect(
    keepLinks(chat([link('https://files.test/old.mp4', 1)]), fresh),
  ).toEqual(fresh)
  expect(keepLinks(undefined, fresh)).toBe(fresh)
})

it('does not reload a photo when the conversation is fetched again', async () => {
  const photo = (url: string) =>
    message('m1', 'courier', null, 1, {
      type: 'IMAGE',
      url,
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    })
  vi.mocked(api.getChat)
    .mockResolvedValueOnce(chat([photo('https://files.test/first.jpg')]))
    .mockResolvedValue(chat([photo('https://files.test/second.jpg')]))
  const { client } = setup(accepted({ status: 'COMPLETED' }))
  const img = await screen.findByRole('img', { name: 'Photo' })
  await act(() => client.refetchQueries())
  expect(api.getChat).toHaveBeenCalledTimes(2)
  // Let the panel re-render with the refetched conversation.
  await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
  expect(img).toHaveAttribute('src', 'https://files.test/first.jpg')
})

it('plays videos in the conversation', async () => {
  vi.mocked(api.getChat).mockResolvedValue(
    chat([
      message('m1', 'courier', null, 1, {
        type: 'VIDEO',
        url: 'https://files.test/clip.mp4',
        expiresAt: '2099-01-01T00:00:00Z',
      }),
    ]),
  )
  setup(accepted())
  const video = await screen.findByLabelText('Video')
  expect(video).toHaveAttribute('src', 'https://files.test/clip.mp4')
  expect(video).toHaveAttribute('controls')
})

it('keeps a failed message with a Retry that resends the same message', async () => {
  vi.mocked(api.sendMessage)
    .mockRejectedValueOnce(new Error('offline'))
    .mockImplementationOnce(async (_errand, sent) =>
      message(sent.id, 'requester', sent.body, 2),
    )
  const { user } = setup(accepted())
  await user.type(
    await screen.findByRole('textbox', { name: 'Message' }),
    'Are you close?{Enter}',
  )
  await screen.findByText(/Not sent/)
  await user.click(screen.getByRole('button', { name: 'Retry' }))

  await vi.waitFor(() =>
    expect(screen.queryByText(/Not sent/)).not.toBeInTheDocument(),
  )
  const [first, second] = vi.mocked(api.sendMessage).mock.calls
  expect(second[1]).toEqual(first[1])
  expect(screen.getAllByText('Are you close?')).toHaveLength(1)
})

it('says so when the live connection drops, and catches up when it is back', async () => {
  setup(accepted())
  await screen.findByText('On my way to the cafe')
  push('disconnect')
  expect(await screen.findByText(/Reconnecting/)).toBeInTheDocument()
  vi.mocked(api.getChat).mockClear()
  push('connect')
  await vi.waitFor(() =>
    expect(screen.queryByText(/Reconnecting/)).not.toBeInTheDocument(),
  )
  expect(api.getChat).toHaveBeenCalled()
})

it('is read-only after the requester confirms receipt', async () => {
  setup(accepted({ status: 'COMPLETED' }))
  await screen.findByText('On my way to the cafe')
  expect(
    screen.queryByRole('textbox', { name: 'Message' }),
  ).not.toBeInTheDocument()
  expect(
    screen.getByText('Errand ended, this chat is closed for view only'),
  ).toBeInTheDocument()
  expect(connectRealtime).not.toHaveBeenCalled()
})

it('lets admins read the conversation without joining it', async () => {
  signIn('admin', ['ADMIN'])
  setup(accepted())
  await screen.findByText('On my way to the cafe')
  expect(
    screen.getByRole('heading', { name: 'Chat between Alex and Sam' }),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('textbox', { name: 'Message' }),
  ).not.toBeInTheDocument()
  expect(connectRealtime).not.toHaveBeenCalled()
  expect(api.markChatRead).not.toHaveBeenCalled()
})

it('stays hidden until a courier has accepted', () => {
  setup(orderFixture())
  expect(screen.queryByRole('region', { name: 'Chat' })).not.toBeInTheDocument()
  expect(api.getChat).not.toHaveBeenCalled()
})
