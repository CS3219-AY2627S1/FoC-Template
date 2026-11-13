import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useParticipantNames } from './useParticipantNames'
import { saveSession } from './auth/session'

const id = '10000000-0000-4000-8000-000000000001'
const other = '20000000-0000-4000-8000-000000000001'
function session(token = 'test-only') {
  saveSession({
    userId: id,
    username: 'Reviewer',
    role: 'ADMIN',
    accessToken: token,
    tokenType: 'Bearer',
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  })
}
afterEach(() => {
  sessionStorage.clear()
  vi.unstubAllGlobals()
})
it('uses the exact account match and removes names when the session changes', async () => {
  session()
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ content: [{ userId: id, username: 'Mei' }] }),
  })
  vi.stubGlobal('fetch', fetcher)
  const view = renderHook(() => useParticipantNames([id, id]))
  await waitFor(() => expect(view.result.current).toEqual({ [id]: 'Mei' }))
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(fetcher.mock.calls[0]![0]).toContain(`query=${id}&page=0&size=1`)
  fetcher.mockResolvedValue({ ok: false, status: 403 })
  session('replacement-token')
  view.rerender()
  expect(view.result.current).toEqual({})
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
  expect(view.result.current).toEqual({})
})
it.each([
  {
    ok: true,
    json: async () => ({
      content: [{ userId: other, username: 'Wrong person' }],
    }),
  },
  { ok: true, json: async () => ({ content: [] }) },
  { ok: false, status: 503 },
])(
  'falls back without assigning another account name or inferring identity on failure',
  async (response) => {
    session()
    const fetcher = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', fetcher)
    const view = renderHook(() => useParticipantNames([id]))
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    expect(view.result.current).toEqual({})
  },
)
