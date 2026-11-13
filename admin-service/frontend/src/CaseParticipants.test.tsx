import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CaseParticipants } from './CaseParticipants'
import { type Timeline } from './EvidencePanel'
import { type Detail } from './cases'
import { saveSession } from './auth/session'
import userEvent from '@testing-library/user-event'

const requester = '10000000-0000-4000-8000-000000000001'
const courier = '20000000-0000-4000-8000-000000000001'
const actor = '30000000-0000-4000-8000-000000000001'
const caseId = '40000000-0000-4000-8000-000000000001'
const orderId = '50000000-0000-4000-8000-000000000001'
const at = '2026-11-09T10:00:00Z'
const detail: Detail = {
  case: {
    caseId,
    orderId,
    state: 'UNDER_REVIEW',
    reviewerId: actor,
    revision: 2,
    createdAt: at,
  },
  // The API's statement order must never determine the person's errand role.
  statements: [
    {
      reporterId: courier,
      description: 'The requester did not collect the item.',
      submittedAt: at,
    },
    {
      reporterId: requester,
      description: 'Part of my order was missing.',
      submittedAt: at,
    },
  ],
  actions: [],
}
const evidence: Timeline = {
  caseId,
  orderId,
  evidenceRevision: 'test-only',
  order: {
    orderId,
    requesterId: requester,
    courierId: courier,
    status: 'COMPLETED',
    title: 'Test-only lunch errand',
    description: 'Lunch',
    creditReward: 10,
    pickupDeadline: at,
    pickupLocationId: requester,
    dropoffLocationId: courier,
    pickupLocationName: 'Canteen',
    dropoffLocationName: 'Library',
  },
  participants: [
    {
      userId: requester,
      relationship: 'REQUESTER',
      assignedAt: null,
      unassignedAt: null,
    },
    {
      userId: courier,
      relationship: 'HISTORICAL_COURIER',
      assignedAt: at,
      unassignedAt: null,
    },
  ],
  records: [],
  coverage: { status: 'UNKNOWN', asOf: at, checkpoints: [], blockingGaps: [] },
  nextCursor: null,
}
function show(value = detail, timeline: Timeline | null = evidence) {
  return render(
    <CaseParticipants
      detail={value}
      summary={value.case}
      actorId={actor}
      evidence={timeline}
    />,
  )
}
function card(name: string) {
  return within(screen.getByRole('article', { name }))
}
beforeEach(() => {
  saveSession({
    userId: actor,
    username: 'Test reviewer',
    role: 'ADMIN',
    accessToken: 'test-only',
    tokenType: 'Bearer',
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] }),
  )
})
afterEach(() => {
  sessionStorage.clear()
  vi.unstubAllGlobals()
})

it('groups each statement and SVG actions under the correct role, regardless of report ordering', async () => {
  show()
  expect(
    card('Requester').getByText('Part of my order was missing.'),
  ).toBeVisible()
  expect(
    card('Courier 1').getByText('The requester did not collect the item.'),
  ).toBeVisible()
  expect(
    card('Requester').queryByText('The requester did not collect the item.'),
  ).not.toBeInTheDocument()
  expect(
    card('Requester')
      .getByRole('button', { name: 'Private chat' })
      .querySelector('svg'),
  ).toHaveAttribute('aria-hidden', 'true')
  expect(
    screen.queryByRole('region', { name: 'Credit corrections' }),
  ).not.toBeInTheDocument()
  fireEvent.click(
    card('Courier 1').getByRole('button', { name: 'Adjust credits' }),
  )
  const panel = within(
    screen.getByRole('region', { name: 'Credit corrections' }),
  )
  expect(panel.queryByLabelText('Participant')).not.toBeInTheDocument()
  expect(panel.getByRole('link', { name: 'Courier 1' })).toHaveAttribute(
    'href',
    `#person-${courier}`,
  )
  await waitFor(() =>
    expect(
      screen.getByRole('heading', { name: 'Credit corrections', level: 3 }),
    ).toHaveFocus(),
  )
  fireEvent.change(panel.getByLabelText('Number of credits'), {
    target: { value: '5' },
  })
  fireEvent.change(panel.getByLabelText('Reason for correction'), {
    target: { value: 'Missing item' },
  })
  fireEvent.click(panel.getByRole('button', { name: 'Review correction' }))
  expect(
    panel.getByRole('region', { name: 'Confirm credit correction' }),
  ).toHaveTextContent('Add 5 credits to Courier 1')
  expect(
    panel.getByRole('button', { name: 'Confirm credit correction' }),
  ).toHaveFocus()
})

it('marks each reporter and bounds tools to the selected account column using supplied names', () => {
  const value = {
    ...detail,
    statements: detail.statements.filter((s) => s.reporterId === courier),
  }
  render(
    <CaseParticipants
      detail={value}
      summary={value.case}
      actorId={actor}
      evidence={evidence}
      names={{ [requester]: 'Mei', [courier]: 'Kai' }}
    />,
  )
  expect(card('Courier [Kai]').getByText('Reporter')).toBeVisible()
  expect(
    card('Requester [Mei]').queryByText('Reporter'),
  ).not.toBeInTheDocument()
  expect(screen.queryByText(/\d reports?/)).not.toBeInTheDocument()
  fireEvent.click(
    card('Courier [Kai]').getByRole('button', { name: 'Adjust credits' }),
  )
  expect(
    screen
      .getByRole('region', { name: 'Credit corrections' })
      .closest('.participant-tools-area'),
  ).toHaveStyle({ gridColumn: '2' })
})

it('opens private chat and ban review for the account chosen on its card', async () => {
  show()
  fireEvent.click(
    card('Courier 1').getByRole('button', { name: 'Private chat' }),
  )
  const chat = within(
    screen.getByRole('region', { name: 'Participant conversations' }),
  )
  expect(chat.queryByText('Change participant')).not.toBeInTheDocument()
  expect(chat.getByRole('link', { name: 'Courier 1' })).toHaveAttribute(
    'href',
    `#person-${courier}`,
  )
  fireEvent.click(
    card('Requester').getByRole('button', { name: 'Ban account' }),
  )
  const bans = within(
    screen.getByRole('region', { name: 'Account ban requests' }),
  )
  expect(bans.queryByLabelText('Participant')).not.toBeInTheDocument()
  fireEvent.change(bans.getByLabelText('Reason for ban'), {
    target: { value: 'Reviewed account misuse' },
  })
  fireEvent.click(bans.getByRole('button', { name: 'Review ban request' }))
  expect(
    bans.getByRole('region', { name: 'Confirm account ban' }),
  ).toHaveTextContent('Request a ban for Requester?')
  expect(
    screen.queryByRole('region', { name: 'Participant conversations' }),
  ).not.toBeInTheDocument()
})

it('resumes the original uncertain correction and cannot retarget it from another card', async () => {
  const key = '60000000-0000-4000-8000-000000000001'
  const body = {
    type: 'CREDIT_ADJUSTMENT',
    targetUserId: courier,
    amount: -5,
    reason: 'Original correction',
  }
  sessionStorage.setItem(
    `foc.credit-action-pending.${actor}.${caseId}`,
    JSON.stringify({ key, body }),
  )
  const fetcher = vi
    .fn()
    .mockImplementation((_url, init) =>
      init?.method === 'POST'
        ? Promise.reject(new TypeError('Test-only lost response'))
        : Promise.resolve({ ok: true, status: 200, json: async () => [] }),
    )
  vi.stubGlobal('fetch', fetcher)
  show()
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Resume credit correction for Courier 1',
    }),
  )
  fireEvent.click(
    card('Requester').getByRole('button', { name: 'Adjust credits' }),
  )
  const panel = within(
    screen.getByRole('region', { name: 'Credit corrections' }),
  )
  expect(panel.queryByLabelText('Participant')).not.toBeInTheDocument()
  expect(screen.getByRole('article', { name: 'Courier 1' })).toHaveClass(
    'case-person-selected',
  )
  expect(screen.getByRole('article', { name: 'Requester' })).not.toHaveClass(
    'case-person-selected',
  )
  expect(panel.getByText(/Finish or cancel the current review/)).toBeVisible()
  fireEvent.click(panel.getByRole('button', { name: 'Retry same correction' }))
  await panel.findByRole('alert')
  const sent = fetcher.mock.calls.find((call) => call[1]?.method === 'POST')![1]
  expect(JSON.parse(sent.body)).toEqual(body)
  expect(sent.headers['Idempotency-Key']).toBe(key)
})

it('shows only the selected account history and switches history through participant cards', () => {
  const actions: Detail['actions'] = [requester, courier].map((id, index) => ({
    operationId: index ? orderId : caseId,
    caseId,
    targetUserId: id,
    type: 'CREDIT_ADJUSTMENT',
    amount: 5,
    reason: index ? 'Courier correction reason' : 'Requester correction reason',
    status: 'SUCCEEDED',
    reasonCode: null,
    createdAt: at,
    completedAt: at,
  }))
  show({ ...detail, actions })
  fireEvent.click(
    card('Courier 1').getByRole('button', { name: 'Adjust credits' }),
  )
  const panel = within(
    screen.getByRole('region', { name: 'Credit corrections' }),
  )
  fireEvent.click(panel.getByText('Action history (1)'))
  expect(panel.getByText('Courier correction reason')).toBeVisible()
  expect(
    panel.queryByText('Requester correction reason'),
  ).not.toBeInTheDocument()
  fireEvent.click(
    card('Requester').getByRole('button', { name: 'Adjust credits' }),
  )
  const switched = within(
    screen.getByRole('region', { name: 'Credit corrections' }),
  )
  expect(switched.getByText('Requester correction reason')).toBeVisible()
  expect(
    switched.queryByText('Courier correction reason'),
  ).not.toBeInTheDocument()
  expect(screen.getByRole('article', { name: 'Requester' })).toHaveClass(
    'case-person-selected',
  )
})

it('offers verified non-reporters history and chat without bypassing another reviewer', () => {
  show({
    ...detail,
    case: { ...detail.case, reviewerId: requester },
    statements: detail.statements.filter((s) => s.reporterId === requester),
  })
  expect(
    card('Courier 1').getByRole('button', { name: 'Private chat' }),
  ).toBeEnabled()
  expect(
    card('Courier 1').getByRole('button', { name: 'Credit history' }),
  ).toBeEnabled()
  expect(
    card('Courier 1').getByRole('button', { name: 'Ban history' }),
  ).toBeEnabled()
  fireEvent.click(
    card('Requester').getByRole('button', { name: 'Credit history' }),
  )
  expect(
    screen.queryByRole('button', { name: 'Review correction' }),
  ).not.toBeInTheDocument()
  fireEvent.click(
    screen.getByRole('button', { name: 'Close participant tools' }),
  )
  expect(
    card('Requester').getByRole('button', { name: 'Credit history' }),
  ).toHaveFocus()
})

it('supports keyboard activation and returns focus to the exact card action on close', async () => {
  const user = userEvent.setup()
  show()
  const button = card('Courier 1').getByRole('button', {
    name: 'Adjust credits',
  })
  button.focus()
  await user.keyboard('{Enter}')
  await waitFor(() =>
    expect(
      screen.getByRole('heading', { name: 'Credit corrections', level: 3 }),
    ).toHaveFocus(),
  )
  await user.tab()
  expect(
    screen.getByRole('button', { name: 'Close participant tools' }),
  ).toHaveFocus()
  await user.keyboard('{Enter}')
  expect(button).toHaveFocus()
  expect(
    screen.queryByRole('region', { name: 'Credit corrections' }),
  ).not.toBeInTheDocument()
})

it('uses reporting-account labels when evidence is unavailable and preserves historical couriers', () => {
  const view = show(detail, null)
  expect(
    screen.queryByRole('article', { name: 'Requester' }),
  ).not.toBeInTheDocument()
  expect(card('Reporting participant 1').getByText(courier)).toBeVisible()
  const historical = '70000000-0000-4000-8000-000000000001'
  const timeline = {
    ...evidence,
    participants: [
      ...evidence.participants,
      {
        userId: historical,
        relationship: 'HISTORICAL_COURIER' as const,
        assignedAt: at,
        unassignedAt: at,
      },
    ],
  }
  view.rerender(
    <CaseParticipants
      detail={detail}
      summary={detail.case}
      actorId={actor}
      evidence={timeline}
    />,
  )
  expect(card('Courier 2').getByText(historical)).toBeVisible()
  expect(
    card('Courier 2').getByRole('button', { name: 'Ban account' }),
  ).toBeEnabled()
})
