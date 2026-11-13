import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ResolutionPanel } from './ResolutionPanel'
import { saveSession } from './auth/session'
import type { AdminAction, Summary } from './cases'

const actor = '10000000-0000-4000-8000-000000000001'
const summary: Summary = {
  caseId: '20000000-0000-4000-8000-000000000001',
  orderId: '30000000-0000-4000-8000-000000000001',
  reviewerId: actor,
  state: 'UNDER_REVIEW',
  revision: 3,
  createdAt: '2026-11-04T00:00:00Z',
}
const action: AdminAction = {
  operationId: '40000000-0000-4000-8000-000000000001',
  caseId: summary.caseId,
  targetUserId: actor,
  type: 'BAN',
  amount: null,
  reason: 'Reviewed account safety',
  status: 'REJECTED',
  reasonCode: 'SELF_SANCTION_FORBIDDEN',
  createdAt: summary.createdAt,
  completedAt: summary.createdAt,
}
beforeEach(() =>
  saveSession({
    accessToken: 'test-only',
    tokenType: 'Bearer',
    userId: actor,
    username: 'Reviewer',
    role: 'ADMIN',
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  }),
)
afterEach(() => {
  sessionStorage.clear()
  vi.unstubAllGlobals()
})
function enterReason() {
  fireEvent.change(screen.getByLabelText('Internal resolution reason'), {
    target: { value: 'All available evidence reviewed' },
  })
}
it('recovers a prepared resolution from the server after browser retry storage is lost', async () => {
  const operationId = '50000000-0000-4000-8000-000000000001'
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ case: { ...summary, state: 'RESOLVED' } }),
  })
  vi.stubGlobal('fetch', fetcher)
  render(
    <ResolutionPanel
      summary={summary}
      actor={actor}
      actions={[]}
      closure={{
        operationId,
        resolution: 'Prepared decision',
        revision: 3,
        explanations: [],
      }}
      refresh={() => {}}
    />,
  )
  expect(screen.getByLabelText('Internal resolution reason')).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('Closure is preparing')
  fireEvent.click(screen.getByRole('button', { name: 'Check case closure' }))
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
  expect(fetcher.mock.calls[0]![1].headers['Idempotency-Key']).toBe(operationId)
  expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({
    resolution: 'Prepared decision',
    creditDisposition: 'KEEP_EXISTING',
    expectedRevision: 3,
    rejectedActionExplanations: [],
  })
})
it('requires confirmation and closes a no-action case with the original revision', async () => {
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ case: { ...summary, state: 'RESOLVED' } }),
  })
  vi.stubGlobal('fetch', fetcher)
  const refresh = vi.fn()
  render(
    <ResolutionPanel
      summary={summary}
      actor={actor}
      actions={[]}
      refresh={refresh}
    />,
  )
  expect(
    screen.getByRole('button', { name: 'Review case closure' }),
  ).toBeDisabled()
  enterReason()
  fireEvent.click(screen.getByRole('button', { name: 'Review case closure' }))
  expect(fetcher).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Back to editing' }))
  expect(fetcher).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Review case closure' }))
  fireEvent.click(
    screen.getByRole('button', { name: 'Close case permanently' }),
  )
  expect(await screen.findByRole('status')).toHaveTextContent('Case closed')
  expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({
    resolution: 'All available evidence reviewed',
    creditDisposition: 'KEEP_EXISTING',
    expectedRevision: 3,
    rejectedActionExplanations: [],
  })
  expect(refresh).toHaveBeenCalledOnce()
  expect(screen.getByRole('heading', { name: 'Case resolution' })).toHaveFocus()
})
it('requires an explanation for every rejected action', () => {
  render(
    <ResolutionPanel
      summary={summary}
      actor={actor}
      actions={[action]}
      refresh={() => {}}
    />,
  )
  enterReason()
  expect(
    screen.getByRole('button', { name: 'Review case closure' }),
  ).toBeDisabled()
  fireEvent.change(
    screen.getByLabelText('Why can the case close despite rejected action 1?'),
    {
      target: { value: 'Self-access protected; no replacement ban needed' },
    },
  )
  expect(
    screen.getByRole('button', { name: 'Review case closure' }),
  ).toBeEnabled()
})
it.each(['PENDING', 'UNKNOWN'] as const)(
  'blocks closure for %s actions',
  (status) => {
    render(
      <ResolutionPanel
        summary={summary}
        actor={actor}
        actions={[{ ...action, status, completedAt: null }]}
        refresh={() => {}}
      />,
    )
    enterReason()
    expect(
      screen.getByRole('button', { name: 'Review case closure' }),
    ).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Wait until every action is confirmed',
    )
  },
)
it('retains exact request identity across unavailable Chat or a lost response', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ detail: 'Chat is unavailable. Case remains open.' }),
    })
    .mockResolvedValue({
      ok: true,
      json: async () => ({ case: { ...summary, state: 'RESOLVED' } }),
    })
  vi.stubGlobal('fetch', fetcher)
  render(
    <ResolutionPanel
      summary={summary}
      actor={actor}
      actions={[]}
      refresh={() => {}}
    />,
  )
  enterReason()
  fireEvent.click(screen.getByRole('button', { name: 'Review case closure' }))
  fireEvent.click(
    screen.getByRole('button', { name: 'Close case permanently' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Case remains open',
  )
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Check case closure',
    }),
  )
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
  expect(fetcher.mock.calls[0]![1].body).toEqual(fetcher.mock.calls[1]![1].body)
  expect(fetcher.mock.calls[0]![1].headers['Idempotency-Key']).toEqual(
    fetcher.mock.calls[1]![1].headers['Idempotency-Key'],
  )
})
it('keeps other reviewers read-only and displays the immutable final reason', () => {
  const view = render(
    <ResolutionPanel
      summary={summary}
      actor={summary.orderId}
      actions={[]}
      refresh={() => {}}
    />,
  )
  expect(
    screen.queryByLabelText('Internal resolution reason'),
  ).not.toBeInTheDocument()
  view.rerender(
    <ResolutionPanel
      summary={{ ...summary, state: 'RESOLVED' }}
      actor={actor}
      actions={[]}
      resolution="Final immutable decision"
      refresh={() => {}}
    />,
  )
  expect(screen.getByText('Final immutable decision')).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'Review case closure' }),
  ).not.toBeInTheDocument()
})

it('keeps a durable accepted closure pending until owner confirmations arrive', async () => {
  const operationId = '50000000-0000-4000-8000-000000000002'
  const closure = {
    operationId,
    resolution: 'Prepared decision',
    revision: 3,
    explanations: [],
  }
  const refresh = vi.fn()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ case: summary, closure }),
    }),
  )
  render(
    <ResolutionPanel
      summary={summary}
      actor={actor}
      actions={[]}
      closure={closure}
      refresh={refresh}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Check case closure' }))
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent(
    'waiting for chat, errand and credit confirmations',
  )
  expect(
    screen.queryByText(
      'Case closed. The decision is final and conversations are read-only.',
    ),
  ).not.toBeInTheDocument()
})

it.each([
  ['Return to requester', 'RETURN_TO_REQUESTER'],
  ['Pay courier', 'PAY_COURIER'],
] as const)(
  'reviews and submits the selected %s disposition',
  async (label, value) => {
    const fetcher = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ case: { ...summary, state: 'RESOLVED' } }),
      })
    vi.stubGlobal('fetch', fetcher)
    render(
      <ResolutionPanel
        summary={summary}
        actor={actor}
        actions={[]}
        refresh={() => {}}
      />,
    )
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(label) }))
    enterReason()
    fireEvent.click(screen.getByRole('button', { name: 'Review case closure' }))
    expect(fetcher).not.toHaveBeenCalled()
    expect(
      screen.getByRole('radio', { name: new RegExp(label) }),
    ).toBeDisabled()
    fireEvent.click(
      screen.getByRole('button', { name: 'Close case permanently' }),
    )
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
    expect(JSON.parse(fetcher.mock.calls[0]![1].body).creditDisposition).toBe(
      value,
    )
  },
)
