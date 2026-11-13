import { afterEach, expect, it } from 'vitest'
import { setAccessToken } from '../lib/accessTokenStore'
import { getHomePath } from './getHomePath'

const tokenWithRoles = (roles: string[]) =>
  `header.${btoa(JSON.stringify({ roles }))}.signature`

afterEach(() => setAccessToken(null))

it('redirects admins to the admin dashboard page and normal users to home page', () => {
  setAccessToken(tokenWithRoles(['USER', 'ADMIN']))
  expect(getHomePath()).toBe('/admin')

  setAccessToken(tokenWithRoles(['USER']))
  expect(getHomePath()).toBe('/home')

  setAccessToken(null)
  expect(getHomePath()).toBe('/home')
})
