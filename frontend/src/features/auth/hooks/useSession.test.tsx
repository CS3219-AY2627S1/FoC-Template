import { act, renderHook, cleanup } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { setAccessToken } from '../lib/accessTokenStore'
import { useSession } from './useSession'

const token = (sub: string, roles = ['USER']) =>
  `header.${btoa(JSON.stringify({ sub, roles }))}.signature`
afterEach(() => {
  cleanup()
  setAccessToken(null)
})

it('provides identity without Profile and updates it on token refresh, logout and login', () => {
  setAccessToken(token('A'))
  const { result } = renderHook(() => useSession())
  expect(result.current.userId).toBe('A')
  act(() => setAccessToken(token('A', ['USER', 'ADMIN'])))
  expect(result.current).toEqual({
    userId: 'A',
    roles: ['USER', 'ADMIN'],
  })
  act(() => setAccessToken(null))
  expect(result.current.userId).toBeUndefined()
  expect(result.current.roles).toEqual([])
  act(() => setAccessToken(token('B')))
  expect(result.current.userId).toBe('B')
})
