import { readSession } from './auth/session'
import { CaseError, caseErrorMessage, isUuid, request } from './cases'

export type Conversation = {
  conversationId: string
  caseId: string
  orderId: string
  participantUserId: string
  readOnly: boolean
}
export type ChatMessage = {
  id: string
  conversationId: string
  senderUserId: string
  clientMessageId: string | null
  sequence: number
  createdAt: string
  text: string | null
  attachment: {
    attachmentId: string
    mediaType: string
    sizeBytes: number
  } | null
}
export type MessagePage = { content: ChatMessage[]; nextCursor: string | null }

export async function chatRequest(
  path: string,
  signal: AbortSignal,
  body?: unknown,
): Promise<unknown> {
  const session = readSession()
  if (!session)
    throw new CaseError(401, 'Sign in again to read this conversation.')
  const response = await fetch('/api/chat/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    signal,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!response.ok) throw new CaseError(response.status, 'Chat request failed')
  return response.json()
}
function object(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid Chat response')
}
export function conversation(
  value: unknown,
  expected: Conversation,
): Conversation {
  object(value)
  for (const field of [
    'conversationId',
    'caseId',
    'orderId',
    'participantUserId',
  ] as const) {
    if (
      typeof value[field] !== 'string' ||
      !isUuid(value[field]) ||
      value[field] !== expected[field]
    )
      throw new Error('Mismatched conversation')
  }
  if (typeof value.readOnly !== 'boolean')
    throw new Error('Missing conversation permission')
  return {
    conversationId: expected.conversationId,
    caseId: expected.caseId,
    orderId: expected.orderId,
    participantUserId: expected.participantUserId,
    readOnly: value.readOnly,
  }
}
// Public Chat metadata is deliberately smaller than Admin's confirmed case reference.
export function chatConversation(
  value: unknown,
  expected: Conversation,
): Conversation {
  object(value)
  if (
    value.id !== expected.conversationId ||
    value.orderId !== expected.orderId ||
    !['ACTIVE', 'READ_ONLY'].includes(String(value.status)) ||
    typeof value.readOnly !== 'boolean' ||
    (value.status === 'READ_ONLY' && !value.readOnly)
  )
    throw new Error('Mismatched Chat conversation')
  return { ...expected, readOnly: expected.readOnly || value.readOnly }
}
export async function confirmedConversations(
  summary: { caseId: string; orderId: string },
  actorId: string,
  participantView: boolean,
  signal: AbortSignal,
) {
  const values = await request<unknown>(
    `${participantView ? 'reports' : 'cases'}/${summary.caseId}/conversations`,
    signal,
  )
  if (!Array.isArray(values)) throw new Error('Invalid conversation references')
  const ids = new Set<string>(),
    participants = new Set<string>()
  return values.map((value: unknown) => {
    object(value)
    if (
      typeof value.conversationId !== 'string' ||
      !isUuid(value.conversationId) ||
      typeof value.participantUserId !== 'string' ||
      !isUuid(value.participantUserId) ||
      (participantView && value.participantUserId !== actorId) ||
      ids.has(value.conversationId) ||
      participants.has(value.participantUserId)
    )
      throw new Error('Invalid private reference')
    ids.add(value.conversationId)
    participants.add(value.participantUserId)
    return conversation(value, {
      conversationId: value.conversationId,
      caseId: summary.caseId,
      orderId: summary.orderId,
      participantUserId: value.participantUserId,
      readOnly: true,
    })
  })
}
export async function currentConversation(
  reference: Conversation,
  actorId: string,
  signal: AbortSignal,
  participantView = false,
) {
  const references = await confirmedConversations(
    reference,
    actorId,
    participantView,
    signal,
  )
  const current = references.find(
    (r) =>
      r.conversationId === reference.conversationId &&
      r.participantUserId === reference.participantUserId,
  )
  if (!current) throw new CaseError(404, 'Conversation reference unavailable')
  return chatConversation(
    await chatRequest(`conversations/${reference.conversationId}`, signal),
    current,
  )
}
export function chatMessage(value: unknown, id: string): ChatMessage {
  object(value)
  if (
    typeof value.id !== 'string' ||
    !isUuid(value.id) ||
    value.conversationId !== id ||
    typeof value.senderUserId !== 'string' ||
    !isUuid(value.senderUserId) ||
    !(
      value.clientMessageId === null ||
      (typeof value.clientMessageId === 'string' &&
        isUuid(value.clientMessageId))
    ) ||
    !Number.isSafeInteger(value.sequence) ||
    Number(value.sequence) < 1 ||
    typeof value.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(value.createdAt))
  )
    throw new Error('Invalid message identity')
  if (
    typeof value.text === 'string' &&
    value.text.length > 0 &&
    value.text.length <= 4000 &&
    value.attachment === null
  ) {
    return {
      id: value.id,
      conversationId: id,
      senderUserId: value.senderUserId,
      clientMessageId: value.clientMessageId,
      sequence: Number(value.sequence),
      createdAt: value.createdAt,
      text: value.text,
      attachment: null,
    }
  }
  object(value.attachment)
  const a = value.attachment
  if (
    value.text !== null ||
    typeof a.id !== 'string' ||
    !isUuid(a.id) ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(
      String(a.contentType),
    ) ||
    !Number.isSafeInteger(a.size) ||
    Number(a.size) < 1 ||
    Number(a.size) > 5242880
  )
    throw new Error('Invalid attachment')
  return {
    id: value.id,
    conversationId: id,
    senderUserId: value.senderUserId,
    clientMessageId: value.clientMessageId,
    sequence: Number(value.sequence),
    createdAt: value.createdAt,
    text: null,
    attachment: {
      attachmentId: a.id,
      mediaType: String(a.contentType),
      sizeBytes: Number(a.size),
    },
  }
}
export function messagePage(
  value: unknown,
  id: string,
  after = 0,
): MessagePage {
  if (!Array.isArray(value) || value.length > 20)
    throw new Error('Invalid history page')
  const content = mergeMessages(
    [],
    value.map((m) => chatMessage(m, id)),
  )
  if (content.some((m) => m.sequence <= after))
    throw new Error('History did not advance')
  return {
    content,
    nextCursor:
      content.length === 20
        ? String(content[content.length - 1]!.sequence)
        : null,
  }
}
export function mergeMessages(known: ChatMessage[], additions: ChatMessage[]) {
  const merged = [...known]
  for (const message of additions) {
    const duplicate = merged.find((m) => m.id === message.id)
    if (duplicate) {
      if (JSON.stringify(duplicate) !== JSON.stringify(message))
        throw new Error('Conflicting message')
      continue
    }
    if (
      merged.length &&
      merged[merged.length - 1]!.sequence >= message.sequence
    )
      throw new Error('Conflicting message order')
    merged.push(message)
  }
  return merged
}
export function chatFailure(error: unknown) {
  if (error instanceof CaseError) {
    if (
      error.message.startsWith('You cannot review this case because') ||
      error.message.startsWith('Reviewer independence could not be verified.')
    )
      return caseErrorMessage(error)
    if (error.status === 401)
      return 'You’ve been signed out. Sign in again to see this conversation.'
    if ([403, 404].includes(error.status))
      return 'This conversation isn’t available to you. Refresh the case to check.'
    if (error.status === 409)
      return 'That didn’t work. Refresh to check if you can reply.'
  }
  return 'We couldn’t load this conversation. Refresh before sending again.'
}
