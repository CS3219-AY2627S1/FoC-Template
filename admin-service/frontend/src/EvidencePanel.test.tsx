import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  EvidencePanel,
  type EvidenceRecord,
  type Timeline,
} from './EvidencePanel'
import { saveSession } from './auth/session'

const caseId = '10000000-0000-4000-8000-000000000001'
const orderId = '20000000-0000-4000-8000-000000000001'
const actor = '30000000-0000-4000-8000-000000000001'
const at = '2026-10-29T10:00:00Z'
const snapshot = {
  orderId,
  requesterId: actor,
  courierId: null,
  status: 'OPEN',
  title: 'Campus lunch',
  description: 'Historical order description',
  creditReward: 10,
  pickupDeadline: at,
  pickupLocationId: actor,
  dropoffLocationId: caseId,
  pickupLocationName: null,
  dropoffLocationName: null,
}
function record(id = caseId, sequence = 1): EvidenceRecord {
  return {
    eventId: id,
    source: 'admin-service',
    stream: 'admin.events',
    sourceSequence: sequence,
    orderId,
    action: 'CaseOpened',
    actorUserId: actor,
    occurredAt: at,
    ingestedAt: at,
    data: {
      kind: 'ADMIN',
      caseId,
      operationId: null,
      targetUserId: null,
      result: null,
    },
  }
}
function timeline(): Timeline {
  return {
    caseId,
    orderId,
    evidenceRevision: 'revision-1',
    order: snapshot,
    participants: [
      {
        userId: actor,
        relationship: 'HISTORICAL_COURIER',
        assignedAt: at,
        unassignedAt: at,
      },
    ],
    records: [record()],
    coverage: {
      status: 'COMPLETE',
      asOf: at,
      checkpoints: [
        {
          source: 'admin-service',
          stream: 'admin.events',
          aggregateId: caseId,
          committedSequence: 2,
          projectedSequence: 2,
          checkedAt: at,
        },
      ],
      blockingGaps: [],
    },
    nextCursor: null,
  }
}
function response(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body }
}
beforeEach(() => {
  saveSession({
    userId: actor,
    username: 'Reviewer',
    role: 'ADMIN',
    accessToken: 'user-jwt',
    tokenType: 'Bearer',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
})
it('leads with readable activity and participants, keeping diagnostics collapsed', async () => {
  const user = userEvent.setup()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(timeline())))
  render(<EvidencePanel caseId={caseId} orderId={orderId} />)
  expect(
    await screen.findByText('History checked through the latest update'),
  ).toBeVisible()
  expect(
    screen.queryByRole('heading', { name: /Missing activity/ }),
  ).not.toBeInTheDocument()
  expect(screen.getByText('Courier assigned during this errand')).toBeVisible()
  expect(screen.getByText(/Assigned .*Unassigned/)).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Case opened' })).toBeVisible()
  expect(screen.getByText('By Courier 1')).toBeVisible()
  const event = screen
    .getByRole('heading', { name: 'Case opened' })
    .closest('article')!
  expect(
    within(event)
      .getByText(/Occurred/)
      .querySelector('time'),
  ).toHaveAttribute('datetime', at)
  expect(
    within(event).getByText('admin-service / admin.events'),
  ).not.toBeVisible()
  expect(screen.getByText('revision-1')).not.toBeVisible()
  expect(screen.getByText(`Account ID: ${actor}`)).not.toBeVisible()
  await user.click(within(event).getByText('Technical details'))
  expect(within(event).getByText('admin-service / admin.events')).toBeVisible()
  expect(
    within(event)
      .getByText('Added to evidence')
      .nextElementSibling?.querySelector('time'),
  ).toHaveAttribute('datetime', at)
  await user.click(screen.getByText('Evidence details'))
  expect(screen.getByText('revision-1')).toBeVisible()
  expect(screen.getByText('Campus lunch')).toBeVisible()
  expect(screen.getByText('Historical order description')).toBeVisible()
})
it('does not equate an empty page and absent gaps with complete coverage', async () => {
  const data = timeline()
  data.coverage.status = 'UNKNOWN'
  data.coverage.checkpoints = []
  data.records = []
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(data)))
  render(<EvidencePanel caseId={caseId} orderId={orderId} />)
  expect(
    await screen.findByText('History completeness unverified'),
  ).toBeVisible()
  expect(screen.getByText(/empty page does not prove/)).toBeVisible()
  expect(screen.getByText(/No source checkpoints/)).not.toBeVisible()
  expect(
    screen.queryByText('History checked through the latest update'),
  ).not.toBeInTheDocument()
})

it.each([true, false])(
  'draws credit movement only when the recorded two-account deltas balance (%s)',
  async (balanced) => {
    const data = timeline()
    const courier = '40000000-0000-4000-8000-000000000001'
    data.participants.push({
      userId: courier,
      relationship: 'HISTORICAL_COURIER',
      assignedAt: at,
      unassignedAt: null,
    })
    data.records[0]!.data = {
      kind: 'CREDIT',
      operationId: caseId,
      result: 'APPLIED',
      reasonCode: null,
      ledgerEntries: [
        {
          ledgerEntryId: caseId,
          userId: actor,
          availableDelta: 0,
          reservedDelta: -15,
          availableBalance: 85,
          reservedBalance: 0,
        },
        {
          ledgerEntryId: orderId,
          userId: courier,
          availableDelta: balanced ? 15 : 10,
          reservedDelta: 0,
          availableBalance: 115,
          reservedBalance: 0,
        },
      ],
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(data)))
    render(<EvidencePanel caseId={caseId} orderId={orderId} />)
    await screen.findAllByText('Available credits')
    const movement = screen.queryByLabelText('Recorded credit movement')
    if (balanced) expect(movement).toHaveTextContent('15 credits')
    else expect(movement).not.toBeInTheDocument()
  },
)
it('uses consistent account labels across assignment periods and typed activity without inventing names', async () => {
  const data = timeline()
  const courier = '40000000-0000-4000-8000-000000000001'
  data.participants = [
    {
      userId: actor,
      relationship: 'REQUESTER',
      assignedAt: null,
      unassignedAt: null,
    },
    {
      userId: courier,
      relationship: 'HISTORICAL_COURIER',
      assignedAt: at,
      unassignedAt: at,
    },
    {
      userId: courier,
      relationship: 'HISTORICAL_COURIER',
      assignedAt: at,
      unassignedAt: null,
    },
  ]
  const order = record()
  order.action = 'WITHDRAW'
  order.actorUserId = courier
  order.data = {
    kind: 'ORDER',
    fromState: 'ACCEPTED',
    toState: 'OPEN',
    requesterId: actor,
    courierId: null,
    previousCourierId: courier,
    snapshot,
  }
  const credit = record(orderId, 2)
  credit.action = 'CreditsReleased'
  credit.data = {
    kind: 'CREDIT',
    operationId: caseId,
    result: 'APPLIED',
    reasonCode: null,
    ledgerEntries: [
      {
        ledgerEntryId: orderId,
        userId: actor,
        availableDelta: 10,
        reservedDelta: -10,
        availableBalance: 20,
        reservedBalance: 0,
      },
    ],
  }
  data.records = [order, credit]
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(data)))
  render(<EvidencePanel caseId={caseId} orderId={orderId} />)
  expect(
    await screen.findByRole('heading', { name: 'Courier withdrew' }),
  ).toBeVisible()
  expect(screen.getByText('By Courier 1')).toBeVisible()
  expect(
    screen.getByText('Courier: Unassigned · Previous courier: Courier 1'),
  ).toBeVisible()
  expect(screen.getAllByText('Courier 1', { selector: 'strong' })).toHaveLength(
    2,
  )
  expect(screen.queryByText('Courier 2')).not.toBeInTheDocument()
  expect(
    screen.getByRole('heading', { name: 'Credits released' }),
  ).toBeVisible()
  expect(screen.getByText('Outcome: Applied')).toBeVisible()
  expect(screen.getByText('Available credits')).toBeVisible()
  for (const id of [actor, courier, caseId, orderId]) {
    for (const element of screen.getAllByText(id, { exact: false })) {
      expect(element).not.toBeVisible()
    }
  }
})
it('keeps absent actors and accounts outside supplied history explicit', async () => {
  const data = timeline()
  data.records[0]!.actorUserId = null
  const other = record(orderId, 2)
  other.actorUserId = orderId
  other.action = 'CaseClaimed'
  data.records.push(other)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(data)))
  render(<EvidencePanel caseId={caseId} orderId={orderId} />)
  expect(await screen.findByText('Person not recorded')).toBeVisible()
  expect(
    screen.getByText(
      'By Account not identified in available participant history',
    ),
  ).toBeVisible()
  expect(
    screen.getByRole('heading', { name: 'Reviewer assigned' }),
  ).toBeVisible()
})
it('shows test-only markers from supplied fixtures and never substitutes them on failure', async () => {
  const data = timeline()
  data.order = { ...snapshot, title: 'TEST ONLY — synthetic errand timeline' }
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(response(data))
      .mockResolvedValue(response({}, 503)),
  )
  render(<EvidencePanel caseId={caseId} orderId={orderId} />)
  expect(
    await screen.findByText('TEST ONLY — synthetic errand timeline'),
  ).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh evidence' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'couldn’t load all the evidence',
  )
  expect(
    screen.queryByText('TEST ONLY — synthetic errand timeline'),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('heading', { name: 'Case opened' }),
  ).not.toBeInTheDocument()
})
it('shares the validated participant snapshot with the cards and clears it when evidence is refreshed or denied', async () => {
  const onSnapshot = vi.fn()
  const data = timeline()
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(response(data))
      .mockResolvedValue(response({}, 403)),
  )
  render(
    <EvidencePanel caseId={caseId} orderId={orderId} onSnapshot={onSnapshot} />,
  )
  await screen.findByText('Campus lunch')
  expect(onSnapshot).toHaveBeenLastCalledWith(data)
  fireEvent.click(screen.getByRole('button', { name: 'Refresh evidence' }))
  expect(onSnapshot).toHaveBeenLastCalledWith(null)
  await screen.findByRole('alert')
  expect(onSnapshot).toHaveBeenLastCalledWith(null)
})

it('shows known gaps and projection lag', async () => {
  const data = timeline()
  data.coverage.status = 'INCOMPLETE'
  data.coverage.checkpoints[0]!.projectedSequence = 0
  data.coverage.blockingGaps = [
    {
      source: 'order-service',
      stream: 'order.lifecycle.events',
      aggregateId: orderId,
      fromSequence: 1,
      toSequence: 4,
      reason: 'MISSING_SEQUENCE',
    },
  ]
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(data)))
  render(<EvidencePanel caseId={caseId} orderId={orderId} />)
  expect(await screen.findByText('Evidence is incomplete')).toBeVisible()
  expect(
    screen.getByText('Errand history: Some activity is missing'),
  ).toBeVisible()
  expect(screen.getByText(/Sequences 1–4/)).not.toBeVisible()
  expect(
    screen.getByText(/Some activity has not reached the timeline yet/),
  ).toBeVisible()
  expect(screen.getByText(/Behind/)).not.toBeVisible()
})
it('retries an unavailable page with the same cursor, preserving records and deduplicating overlap', async () => {
  const first = timeline()
  first.nextCursor = 'opaque+/cursor'
  const second = timeline()
  second.records = [record(), record(orderId, 2)]
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(first))
    .mockResolvedValueOnce(response({}, 503))
    .mockResolvedValueOnce(response(second))
  vi.stubGlobal('fetch', fetcher)
  render(<EvidencePanel caseId={caseId} orderId={orderId} />)
  fireEvent.click(
    await screen.findByRole('button', { name: 'Load more evidence' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'this view may be incomplete',
  )
  expect(screen.getByText('History completeness unverified')).toBeVisible()
  fireEvent.click(
    screen.getByRole('button', { name: 'Try loading evidence again' }),
  )
  expect(await screen.findByText('2 events loaded')).toBeVisible()
  expect(fetcher.mock.calls[1]![0]).toBe(fetcher.mock.calls[2]![0])
  expect(fetcher.mock.calls[1]![0]).toContain('cursor=opaque%2B%2Fcursor')
  expect(screen.getAllByRole('heading', { name: 'Case opened' })).toHaveLength(
    2,
  )
})
it('never merges a changed revision and restarts from the first page', async () => {
  const first = timeline()
  first.nextCursor = 'cursor'
  const changed = timeline()
  changed.evidenceRevision = 'revision-2'
  changed.records = [record(orderId, 2)]
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(first))
    .mockResolvedValueOnce(response(changed))
    .mockResolvedValueOnce(response(timeline()))
  vi.stubGlobal('fetch', fetcher)
  render(<EvidencePanel caseId={caseId} orderId={orderId} />)
  fireEvent.click(
    await screen.findByRole('button', { name: 'Load more evidence' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Reload the timeline',
  )
  expect(screen.getByText('1 event loaded')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Reload timeline' }))
  await waitFor(() =>
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
  )
  expect(fetcher.mock.calls[2]![0]).toBe(
    `cases/${caseId}/timeline?limit=20`.replace(/^/, '/api/admin/'),
  )
})
it('clears protected evidence if pagination is denied after revocation', async () => {
  const first = timeline()
  first.nextCursor = 'cursor'
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(response(first))
      .mockResolvedValueOnce(response({}, 403)),
  )
  render(<EvidencePanel caseId={caseId} orderId={orderId} />)
  fireEvent.click(
    await screen.findByRole('button', { name: 'Load more evidence' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'no longer have access',
  )
  expect(
    screen.queryByText('Historical order description'),
  ).not.toBeInTheDocument()
})
it.each([
  'conflicting record',
  'repeated cursor',
  'changed coverage',
  'out of order',
])('requires restart for %s without merging records', async (problem) => {
  const first = timeline()
  first.nextCursor = 'cursor'
  const second = timeline()
  if (problem === 'conflicting record')
    second.records[0]!.action = 'Changed event content'
  if (problem === 'repeated cursor') second.nextCursor = 'cursor'
  if (problem === 'changed coverage')
    second.coverage.asOf = '2026-10-29T11:00:00Z'
  if (problem === 'out of order') {
    second.records = [record(orderId, 2)]
    second.records[0]!.occurredAt = '2026-10-28T10:00:00Z'
  }
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(response(first))
      .mockResolvedValueOnce(response(second)),
  )
  render(<EvidencePanel caseId={caseId} orderId={orderId} />)
  fireEvent.click(
    await screen.findByRole('button', { name: 'Load more evidence' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Reload the timeline',
  )
  expect(screen.getByText('1 event loaded')).toBeVisible()
  expect(
    screen.queryByText('History checked through the latest update'),
  ).not.toBeInTheDocument()
})

it('renders original participant messages in the activity timeline without rewriting', async () => {
  const data = timeline()
  data.records = [
    {
      ...record(),
      source: 'chat-service',
      stream: 'chat.messages',
      action: 'MessageSent',
      data: {
        kind: 'CHAT',
        caseId,
        conversationId: orderId,
        conversationType: 'ERRAND',
        participantUserId: null,
        messageId: caseId,
        messageType: 'TEXT',
        text: 'two bowls. one missing!!!',
        attachment: null,
      },
    },
  ]
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(data)))
  render(<EvidencePanel caseId={caseId} orderId={orderId} />)
  expect(await screen.findByText('two bowls. one missing!!!')).toBeVisible()
})

function chatRecord(
  id: string,
  text: string,
  changes: Partial<EvidenceRecord> = {},
): EvidenceRecord {
  return {
    ...record(id),
    source: 'chat-service',
    stream: 'chat.messages',
    action: 'MessageSent',
    data: {
      kind: 'CHAT',
      caseId,
      conversationId: caseId,
      conversationType: 'ERRAND',
      participantUserId: null,
      messageId: id,
      messageType: 'TEXT',
      text,
      attachment: null,
    },
    ...changes,
  }
}

it('groups consecutive messages but retains each original message, timestamp and audit reference', async () => {
  const data = timeline()
  data.records = [
    chatRecord(caseId, 'First original message'),
    chatRecord(orderId, 'Second original message', {
      occurredAt: '2026-10-29T10:00:06Z',
    }),
  ]
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(data)))
  const { container } = render(
    <EvidencePanel caseId={caseId} orderId={orderId} />,
  )
  expect(await screen.findByText('Second original message')).toBeVisible()
  expect(screen.getByText('First original message')).toBeVisible()
  expect(container.querySelectorAll('.timeline-message-group')).toHaveLength(1)
  expect(container.querySelectorAll('.timeline-message')).toHaveLength(2)
  expect(screen.getByText('29 Oct 2026, 6:00:06 pm SGT')).toBeVisible()
  const details = container.querySelectorAll('.timeline-message details')
  expect(details).toHaveLength(2)
  for (const detail of details)
    fireEvent.click(detail.querySelector('summary')!)
  expect(
    screen
      .getAllByText(orderId, { exact: false })
      .some((el) => el.textContent?.includes(orderId)),
  ).toBe(true)
})

it('keeps intervening events as group boundaries when filtering messages and distinguishes an empty loaded filter', async () => {
  const data = timeline()
  data.records = [
    chatRecord(caseId, 'Before event'),
    record(actor),
    chatRecord(orderId, 'After event'),
  ]
  data.nextCursor = 'next-page'
  const fetcher = vi.fn().mockResolvedValue(response(data))
  vi.stubGlobal('fetch', fetcher)
  const { container } = render(
    <EvidencePanel caseId={caseId} orderId={orderId} />,
  )
  await screen.findByText('After event')
  fireEvent.click(screen.getByRole('button', { name: 'Messages' }))
  expect(container.querySelectorAll('.timeline-message-group')).toHaveLength(2)
  expect(
    screen.queryByRole('heading', { name: 'Case opened' }),
  ).not.toBeInTheDocument()
  expect(screen.getByText(/Showing 2 of 3 loaded events/)).toHaveTextContent(
    'More activity is available',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Credits' }))
  expect(
    screen.getByText(/No matching events in loaded activity/),
  ).toBeVisible()
  expect(
    screen.getByRole('button', { name: 'Load more evidence' }),
  ).toBeEnabled()
  expect(fetcher).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'All activity' }))
  expect(screen.getByText('Before event')).toBeVisible()
})

it.each([
  ['another sender', { actorUserId: orderId }],
  ['an unidentified sender', { actorUserId: null }],
  ['a gap over five minutes', { occurredAt: '2026-10-29T10:06:00Z' }],
] as const)('does not merge messages with %s', async (_label, changes) => {
  const data = timeline()
  data.records = [
    chatRecord(caseId, 'First'),
    chatRecord(orderId, 'Separate', changes),
  ]
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(data)))
  const { container } = render(
    <EvidencePanel caseId={caseId} orderId={orderId} />,
  )
  await screen.findByText('Separate')
  expect(container.querySelectorAll('.timeline-message-group')).toHaveLength(2)
})
