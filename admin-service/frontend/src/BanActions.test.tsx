import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { CreditActions } from './CreditActions'
import { saveSession } from './auth/session'
import type { BanAction, Summary } from './cases'

const actor = '10000000-0000-4000-8000-000000000001',
  target = '20000000-0000-4000-8000-000000000001',
  caseId = '30000000-0000-4000-8000-000000000001'
const summary: Summary = {
  caseId,
  orderId: '40000000-0000-4000-8000-000000000001',
  state: 'UNDER_REVIEW',
  reviewerId: actor,
  revision: 2,
  createdAt: '2026-10-30T10:00:00Z',
}
const action: BanAction = {
  operationId: '50000000-0000-4000-8000-000000000001',
  caseId,
  targetUserId: target,
  type: 'BAN',
  amount: null,
  reason: 'Reviewed account safety',
  status: 'PENDING',
  reasonCode: null,
  createdAt: summary.createdAt,
  completedAt: null,
}
beforeEach(() =>
  saveSession({
    userId: actor,
    username: 'Reviewer',
    role: 'ADMIN',
    accessToken: 'test-only',
    tokenType: 'Bearer',
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  }),
)
afterEach(() => {
  sessionStorage.clear()
  vi.unstubAllGlobals()
})
it('requires a reason and confirmation, omits amount and preserves the exact request on uncertain submission', async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('lost'))
    .mockResolvedValue({ ok: true, status: 202, json: async () => action })
  vi.stubGlobal('fetch', fetcher)
  render(
    <CreditActions
      kind="BAN"
      summary={summary}
      actorId={actor}
      participantIds={[target]}
    />,
  )
  expect(screen.queryByLabelText('Number of credits')).not.toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Review ban request' }),
  ).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Participant'), {
    target: { value: target },
  })
  fireEvent.change(screen.getByLabelText('Reason for ban'), {
    target: { value: action.reason },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Review ban request' }))
  expect(fetcher).not.toHaveBeenCalled()
  expect(
    screen.getByRole('region', { name: 'Confirm account ban' }),
  ).toHaveTextContent('ban for Participant 1')
  expect(
    screen.getByRole('region', { name: 'Confirm account ban' }),
  ).toHaveTextContent('won’t be able to sign in or do anything new')
  expect(screen.queryByText(/sessions.*until expiry/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm ban request' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'couldn’t confirm the ban request’s outcome',
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry same ban request' }),
  )
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
  const first = fetcher.mock.calls[0]![1],
    second = fetcher.mock.calls[1]![1]
  expect(JSON.parse(first.body)).toEqual({
    type: 'BAN',
    targetUserId: target,
    reason: action.reason,
  })
  expect(first.body).toEqual(second.body)
  expect(first.headers['Idempotency-Key']).toEqual(
    second.headers['Idempotency-Key'],
  )
  expect(await screen.findByText('Awaiting confirmation')).toBeInTheDocument()
  expect(
    screen.getByRole('link', { name: 'Manage accounts and reactivation' }),
  ).toHaveAttribute('href', '/?view=users')
})
it('shows authoritative protected-account rejection with readable Singapore time', () => {
  render(
    <CreditActions
      kind="BAN"
      summary={summary}
      actorId={actor}
      participantIds={[target]}
      initialActions={[
        {
          ...action,
          status: 'REJECTED',
          reasonCode: 'SELF_SANCTION_FORBIDDEN',
          completedAt: summary.createdAt,
        },
      ]}
    />,
  )
  expect(screen.getByText(/Your own account is protected/)).toBeInTheDocument()
  expect(screen.getByText('Rejected')).toBeInTheDocument()
  expect(screen.getByText(/Ban rejected/)).toBeInTheDocument()
})
it('keeps other reviewers read-only and labels UNKNOWN without declaring failure or success', () => {
  render(
    <CreditActions
      kind="BAN"
      summary={summary}
      actorId={target}
      participantIds={[target]}
      initialActions={[{ ...action, status: 'UNKNOWN' }]}
    />,
  )
  expect(
    screen.queryByRole('button', { name: 'Review ban request' }),
  ).not.toBeInTheDocument()
  expect(screen.getByText('Outcome unconfirmed')).toBeInTheDocument()
  expect(screen.getByText(/may already be done/)).toBeInTheDocument()
})
