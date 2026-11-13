import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  CaseConversations,
  ParticipantConversationStatus,
} from './CaseConversations'
import { ConversationThread } from './ConversationThread'
import { saveSession } from './auth/session'
import {
  chatConversation,
  chatMessage,
  confirmedConversations,
  conversation,
  messagePage,
  type Conversation,
} from './conversations'
import type { Summary } from './cases'

const actor = '10000000-0000-4000-8000-000000000001',
  participant = '20000000-0000-4000-8000-000000000001',
  caseId = '30000000-0000-4000-8000-000000000001',
  orderId = '40000000-0000-4000-8000-000000000001',
  conversationId = '50000000-0000-4000-8000-000000000001',
  secondId = '60000000-0000-4000-8000-000000000001'
const reference: Conversation = {
  conversationId,
  caseId,
  orderId,
  participantUserId: participant,
  readOnly: false,
}
const metadata = {
  id: conversationId,
  orderId,
  status: 'ACTIVE',
  readOnly: false,
}
const summary: Summary = {
  caseId,
  orderId,
  reviewerId: actor,
  state: 'UNDER_REVIEW',
  revision: 2,
  createdAt: '2026-10-29T10:00:00Z',
}
function response(value: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => value }
}
function message(sequence = 1, text = 'Hello from the participant') {
  return {
    id: '70000000-0000-4000-8000-' + String(sequence).padStart(12, '0'),
    sequence,
    conversationId,
    senderUserId: participant,
    clientMessageId: secondId,
    createdAt: '2026-10-29T10:00:00Z',
    text,
    attachment: null,
  }
}
function thread(props: Partial<Parameters<typeof ConversationThread>[0]> = {}) {
  return (
    <ConversationThread
      reference={reference}
      actorId={actor}
      reviewerId={actor}
      writable
      {...props}
    />
  )
}
function standard(url: string) {
  return response(
    url.startsWith('/api/admin/')
      ? [reference]
      : url.includes('/messages')
        ? [message()]
        : metadata,
  )
}
type Fetcher = (
  url: string,
  options: RequestInit,
) => Promise<ReturnType<typeof response>>
beforeEach(() => {
  sessionStorage.clear()
  saveSession({
    userId: actor,
    username: 'Reviewer',
    role: 'ADMIN',
    accessToken: 'user-token',
    tokenType: 'Bearer',
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  })
})
afterEach(() => vi.unstubAllGlobals())

it('recovers a confirmed conversation after reload without creating another thread', async () => {
  const fetcher = vi.fn<Fetcher>(async (url) => standard(url))
  vi.stubGlobal('fetch', fetcher)
  const view = render(
    <CaseConversations
      summary={summary}
      actorId={actor}
      participantIds={[participant]}
    />,
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Participant 1' }))
  expect(await screen.findByText('Hello from the participant')).toBeVisible()
  view.unmount()
  render(
    <CaseConversations
      summary={summary}
      actorId={actor}
      participantIds={[participant]}
    />,
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Participant 1' }))
  expect(await screen.findByText('Hello from the participant')).toBeVisible()
  expect(
    fetcher.mock.calls.every(([, options]) => options.method !== 'POST'),
  ).toBe(true)
})
it('shows the participant’s saved thread and preserves resolved read-only history', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => standard(url)),
  )
  render(
    <ParticipantConversationStatus
      summary={{ ...summary, state: 'RESOLVED' }}
      actorId={participant}
    />,
  )
  expect(await screen.findByText('Hello from the participant')).toBeVisible()
  expect(screen.queryByLabelText('Message')).not.toBeInTheDocument()
  expect(screen.getByText('You')).toBeVisible()
})
it('distinguishes empty discovery from unavailable and never creates a thread on GET', async () => {
  const fetcher = vi.fn(async () => response([]))
  vi.stubGlobal('fetch', fetcher)
  render(
    <ParticipantConversationStatus summary={summary} actorId={participant} />,
  )
  expect(
    await screen.findByText(/An admin is reviewing your case/),
  ).toBeVisible()
  fetcher.mockImplementation(async () => response({}, 503))
  fireEvent.click(screen.getByRole('button', { name: 'Check for messages' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'We couldn’t load this conversation',
  )
  expect(
    screen.queryByText(/An admin is reviewing your case/),
  ).not.toBeInTheDocument()
})

it.each([
  ['OPEN', null, 'Your case is waiting for an admin.'],
  ['UNDER_REVIEW', actor, 'An admin is reviewing your case.'],
  ['RESOLVED', actor, 'This case is closed. No messages were exchanged.'],
] as const)(
  'explains the next step for an empty %s case without creating a conversation',
  async (state, reviewerId, text) => {
    const fetcher = vi.fn<Fetcher>(async () => response([]))
    vi.stubGlobal('fetch', fetcher)
    render(
      <ParticipantConversationStatus
        summary={{ ...summary, state, reviewerId }}
        actorId={participant}
      />,
    )
    expect(
      await screen.findByText((value) => value.startsWith(text)),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Check for messages' }),
    ).toBeEnabled()
    expect(
      screen.getAllByText('Only you and the admins can see this.'),
    ).toHaveLength(1)
    expect(
      fetcher.mock.calls.every(
        ([, options]) => !options || options.method === 'GET',
      ),
    ).toBe(true)
    if (state === 'RESOLVED') {
      expect(
        screen.queryByText(/can contact you|Check here for messages/),
      ).not.toBeInTheDocument()
    }
  },
)
it('lets another admin select saved history without initiating or replying', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => standard(url)),
  )
  render(
    <CaseConversations
      summary={summary}
      actorId={secondId}
      participantIds={[participant]}
    />,
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Participant 1' }))
  expect(await screen.findByText('Hello from the participant')).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'Start private conversation' }),
  ).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Message')).not.toBeInTheDocument()
})
it('retains initiation identity after a lost response and reload, isolating participant selection', async () => {
  const openings: RequestInit[] = []
  let confirmed = false
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options: RequestInit) => {
      if (url.startsWith('/api/admin/')) {
        if (options.method !== 'POST')
          return response(confirmed ? [reference] : [])
        openings.push(options)
        if (openings.length === 1) throw new TypeError('lost response')
        confirmed = true
        return response(reference)
      }
      return standard(url)
    }),
  )
  const view = render(
    <CaseConversations
      summary={summary}
      actorId={actor}
      participantIds={[participant, secondId]}
    />,
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Participant 1' }))
  fireEvent.click(
    screen.getByRole('button', { name: 'Start private conversation' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'We couldn’t load this conversation',
  )
  view.unmount()
  render(
    <CaseConversations
      summary={summary}
      actorId={actor}
      participantIds={[participant, secondId]}
    />,
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Participant 1' }))
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry opening conversation' }),
  )
  expect(await screen.findByText('Hello from the participant')).toBeVisible()
  expect(
    (openings[0]!.headers as Record<string, string>)['Idempotency-Key'],
  ).toBe((openings[1]!.headers as Record<string, string>)['Idempotency-Key'])
  expect(openings[0]!.body).toBe(openings[1]!.body)
  fireEvent.click(screen.getByRole('button', { name: 'Participant 2' }))
  expect(
    screen.queryByText('Hello from the participant'),
  ).not.toBeInTheDocument()
})
it('retries uncertain sends with the original clientMessageId and no optimistic delivery', async () => {
  const sends: unknown[] = []
  const sentMessage = {
    ...message(2, 'Please clarify the pickup'),
    senderUserId: actor,
  }
  let accepted = false
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options: RequestInit) => {
      if (options.method === 'POST') {
        sends.push(JSON.parse(String(options.body)))
        if (sends.length === 1) throw new TypeError('lost reply')
        accepted = true
        sentMessage.clientMessageId = JSON.parse(
          String(options.body),
        ).clientMessageId
        return response(sentMessage)
      }
      return url.includes('/messages')
        ? response(accepted ? [message(), sentMessage] : [message()])
        : standard(url)
    }),
  )
  render(thread())
  expect(await screen.findByText('Hello from the participant')).toBeVisible()
  expect(screen.getByText('29 Oct 2026, 6:00:00 pm SGT')).toBeVisible()
  fireEvent.change(screen.getByLabelText('Message'), {
    target: { value: 'Please clarify the pickup' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Refresh before sending again',
  )
  expect(
    screen.queryByText('Please clarify the pickup', { selector: 'p' }),
  ).not.toBeInTheDocument()
  expect(screen.getByLabelText('Message')).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh conversation' }))
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Retry same message' }),
    ).toBeEnabled(),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Retry same message' }))
  expect(await screen.findByText('Message sent.')).toBeVisible()
  expect(sends).toHaveLength(2)
  expect(sends[0]).toEqual(sends[1])
})
it('does not acknowledge a send response belonging to another client operation', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options: RequestInit) =>
      options.method === 'POST'
        ? response({ ...message(2, 'A reply'), senderUserId: actor })
        : standard(url),
    ),
  )
  render(thread())
  await screen.findByText('Hello from the participant')
  fireEvent.change(screen.getByLabelText('Message'), {
    target: { value: 'A reply' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Refresh before sending again',
  )
  expect(screen.queryByText('Message sent.')).not.toBeInTheDocument()
  expect(
    sessionStorage.getItem(
      `foc.chat-pending.${actor}.${caseId}.${conversationId}`,
    ),
  ).toContain('clientMessageId')
})
it('preserves history and disables replies when Chat says read-only', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url.startsWith('/api/chat/') && !url.includes('/messages')
        ? response({ ...metadata, status: 'READ_ONLY', readOnly: true })
        : standard(url),
    ),
  )
  render(thread())
  expect(await screen.findByText('Hello from the participant')).toBeVisible()
  expect(screen.getByLabelText('Message')).toBeDisabled()
})
it('denies a different participant before requesting history', () => {
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  render(thread({ participantView: true }))
  expect(screen.getByRole('alert')).toHaveTextContent(
    'can’t see someone else’s conversation',
  )
  expect(fetcher).not.toHaveBeenCalled()
})
it('uses sequence pages, retries the same position and clears history after revocation', async () => {
  let pages = 0
  const urls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url)
      if (url.includes('after=20')) {
        if (++pages === 1) return response({}, 503)
        return response(
          Array.from({ length: 20 }, (_, i) =>
            message(i + 21, 'Next ' + (i + 21)),
          ),
        )
      }
      if (url.includes('after=40')) return response({}, 403)
      if (url.includes('/messages'))
        return response(
          Array.from({ length: 20 }, (_, i) =>
            message(i + 1, 'Page ' + (i + 1)),
          ),
        )
      return standard(url)
    }),
  )
  render(thread())
  fireEvent.click(
    await screen.findByRole('button', { name: 'Load more messages' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'We couldn’t load this conversation',
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Try loading more messages again' }),
  )
  expect(await screen.findByText('Next 21')).toBeVisible()
  expect(urls.filter((u) => u.includes('after=20'))).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: 'Load more messages' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'isn’t available to you',
  )
  expect(screen.queryByText('Page 1')).not.toBeInTheDocument()
})
it('rejects mismatched metadata/references/messages and nonadvancing pages; maps actual attachments', async () => {
  expect(() =>
    conversation({ ...reference, caseId: orderId }, reference),
  ).toThrow()
  expect(() =>
    chatConversation({ ...metadata, id: secondId }, reference),
  ).toThrow()
  expect(() =>
    chatConversation({ ...metadata, status: 'READ_ONLY' }, reference),
  ).toThrow()
  expect(() =>
    messagePage([{ ...message(), conversationId: secondId }], conversationId),
  ).toThrow()
  expect(() =>
    messagePage([message(), message(1, 'conflict')], conversationId),
  ).toThrow()
  expect(() => messagePage([message()], conversationId, 1)).toThrow()
  expect(() =>
    messagePage({ content: [message()], nextCursor: null }, conversationId),
  ).toThrow()
  const image = {
    ...message(),
    text: null,
    attachment: {
      id: secondId,
      contentType: 'image/png',
      size: 42,
      filename: 'private.png',
    },
  }
  expect(chatMessage(image, conversationId).attachment).toEqual({
    attachmentId: secondId,
    mediaType: 'image/png',
    sizeBytes: 42,
  })
  expect(() =>
    chatMessage(
      { ...image, attachment: { ...image.attachment, size: 0 } },
      conversationId,
    ),
  ).toThrow()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      response([{ ...reference, participantUserId: secondId }]),
    ),
  )
  await expect(
    confirmedConversations(
      summary,
      participant,
      true,
      new AbortController().signal,
    ),
  ).rejects.toThrow()
})
it('rechecks Admin closure before sending even when Chat metadata is stale', async () => {
  let checks = 0
  const fetcher = vi.fn<Fetcher>(async (url) => {
    if (url.startsWith('/api/admin/'))
      return response([{ ...reference, readOnly: ++checks > 1 }])
    return standard(url)
  })
  vi.stubGlobal('fetch', fetcher)
  render(thread())
  await screen.findByText('Hello from the participant')
  fireEvent.change(screen.getByLabelText('Message'), {
    target: { value: 'A reply' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'check if you can reply',
  )
  expect(
    fetcher.mock.calls.every(([, options]) => options.method !== 'POST'),
  ).toBe(true)
})
it('clears history when Admin eligibility is revoked before another page read', async () => {
  let checks = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.startsWith('/api/admin/'))
        return ++checks > 1 ? response({}, 403) : response([reference])
      if (url.includes('/messages'))
        return response(
          Array.from({ length: 20 }, (_, i) =>
            message(i + 1, 'Private ' + (i + 1)),
          ),
        )
      return standard(url)
    }),
  )
  render(thread())
  fireEvent.click(
    await screen.findByRole('button', { name: 'Load more messages' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'isn’t available to you',
  )
  expect(screen.queryByText('Private 1')).not.toBeInTheDocument()
})
