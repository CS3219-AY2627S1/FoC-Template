import { fireEvent, render, screen, waitFor, act } from '@testing-library/react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { CreditActions } from './CreditActions'
import { saveSession } from './auth/session'
import type { CreditAction, Summary } from './cases'

const actor = '10000000-0000-4000-8000-000000000001',
  target = '20000000-0000-4000-8000-000000000001',
  caseId = '30000000-0000-4000-8000-000000000001',
  orderId = '40000000-0000-4000-8000-000000000001',
  operationId = '50000000-0000-4000-8000-000000000001'
const summary: Summary = {
  caseId,
  orderId,
  state: 'UNDER_REVIEW',
  reviewerId: actor,
  revision: 2,
  createdAt: '2026-10-29T10:00:00Z',
}
function action(status: CreditAction['status'] = 'PENDING'): CreditAction {
  return {
    operationId,
    caseId,
    targetUserId: target,
    type: 'CREDIT_ADJUSTMENT',
    amount: -5,
    reason: 'Missing item correction',
    status,
    reasonCode: status === 'REJECTED' ? 'INSUFFICIENT_AVAILABLE_CREDITS' : null,
    createdAt: summary.createdAt,
    completedAt: ['SUCCEEDED', 'REJECTED'].includes(status)
      ? summary.createdAt
      : null,
  }
}
const response = (value: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => value,
})
function setup(initialActions: CreditAction[] = [], who = actor) {
  return render(
    <CreditActions
      summary={summary}
      actorId={who}
      participantIds={[target]}
      initialActions={initialActions}
    />,
  )
}
function fill() {
  fireEvent.change(screen.getByLabelText('Participant'), {
    target: { value: target },
  })
  fireEvent.click(screen.getByLabelText('Subtract credits'))
  fireEvent.change(screen.getByLabelText('Number of credits'), {
    target: { value: '5' },
  })
  fireEvent.change(screen.getByLabelText('Reason for correction'), {
    target: { value: 'Missing item correction' },
  })
}
beforeEach(() => {
  saveSession({
    userId: actor,
    username: 'Reviewer',
    role: 'ADMIN',
    accessToken: 'user-jwt',
    tokenType: 'Bearer',
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  sessionStorage.clear()
})
it('requires confirmation and preserves the same request after an uncertain submission', async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('lost response'))
    .mockResolvedValueOnce(response(action(), 202))
    .mockResolvedValue(response(action()))
  vi.stubGlobal('fetch', fetcher)
  setup()
  fill()
  fireEvent.click(screen.getByRole('button', { name: 'Review correction' }))
  expect(fetcher).not.toHaveBeenCalled()
  expect(
    screen.getByRole('region', { name: 'Confirm credit correction' }),
  ).toHaveTextContent('Subtract 5 credits from Participant 1')
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirm credit correction' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'couldn’t confirm the correction request’s outcome',
  )
  expect(screen.getByLabelText('Number of credits')).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Retry same correction' }))
  expect(await screen.findByText('Awaiting confirmation')).toBeVisible()
  expect(screen.getByText(/Waiting for confirmation/)).toBeVisible()
  const first = fetcher.mock.calls[0]![1],
    second = fetcher.mock.calls[1]![1]
  expect(first.body).toBe(second.body)
  expect(first.headers['Idempotency-Key']).toBe(
    second.headers['Idempotency-Key'],
  )
  expect(JSON.parse(first.body)).toEqual({
    type: 'CREDIT_ADJUSTMENT',
    targetUserId: target,
    amount: -5,
    reason: 'Missing item correction',
  })
  expect(screen.queryByText('Completed')).not.toBeInTheDocument()
})
it('blocks empty/fractional/zero amounts and only offers verified participants', () => {
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  setup()
  expect(screen.getAllByRole('option')).toHaveLength(2)
  fill()
  for (const amount of ['0', '1.5', '2147483648']) {
    fireEvent.change(screen.getByLabelText('Number of credits'), {
      target: { value: amount },
    })
    expect(
      screen.getByRole('button', { name: 'Review correction' }),
    ).toBeDisabled()
  }
  expect(fetcher).not.toHaveBeenCalled()
})
it('lets other administrators review history without offering a correction form', () => {
  setup([action('REJECTED')], orderId)
  expect(screen.getByText('Rejected')).toBeVisible()
  expect(screen.getByText(/doesn’t have enough credits/)).toBeVisible()
  expect(screen.queryByLabelText('Number of credits')).not.toBeInTheDocument()
})
it('shows UNKNOWN as uncertain and reconciles a late success without another command', async () => {
  const fetcher = vi.fn().mockResolvedValue(response(action('SUCCEEDED')))
  vi.stubGlobal('fetch', fetcher)
  setup([action('UNKNOWN')])
  expect(screen.getByText('Outcome unconfirmed')).toBeVisible()
  expect(screen.getByText(/may already be done/)).toBeVisible()
  fireEvent.click(
    screen.getByRole('button', { name: 'Refresh correction status' }),
  )
  expect(await screen.findByText('Completed')).toBeVisible()
  expect(fetcher.mock.calls.every((c) => c[1].method === 'GET')).toBe(true)
  expect(screen.getAllByText('29 Oct 2026, 6:00:00 pm SGT')).toHaveLength(2)
})
it('polls pending outcomes without submitting another correction', async () => {
  vi.useFakeTimers()
  const fetcher = vi.fn().mockResolvedValue(response(action('REJECTED')))
  vi.stubGlobal('fetch', fetcher)
  setup([action()])
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000)
  })
  expect(screen.getByText('Rejected')).toBeVisible()
  expect(fetcher).toHaveBeenCalledTimes(1)
})
it('keeps last known status on outage and hides history after access denial', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({}, 503))
    .mockResolvedValue(response({}, 403))
  vi.stubGlobal('fetch', fetcher)
  setup([action('UNKNOWN')])
  fireEvent.click(
    screen.getByRole('button', { name: 'Refresh correction status' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Last confirmed information is shown',
  )
  expect(screen.getByText('Outcome unconfirmed')).toBeVisible()
  fireEvent.click(
    screen.getByRole('button', { name: 'Refresh correction status' }),
  )
  await waitFor(() =>
    expect(screen.queryByText('Outcome unconfirmed')).not.toBeInTheDocument(),
  )
  expect(screen.queryByLabelText('Number of credits')).not.toBeInTheDocument()
})
it('does not silently replace invalid action history with an empty history', () => {
  setup([{ ...action(), caseId: orderId }])
  expect(screen.getByRole('alert')).toHaveTextContent(
    'couldn’t load this case’s actions',
  )
  expect(
    screen.queryByText('No credit corrections recorded for this case.'),
  ).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Number of credits')).not.toBeInTheDocument()
})
