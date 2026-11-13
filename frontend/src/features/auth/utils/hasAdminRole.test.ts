import { afterEach, expect, it } from 'vitest'
import { setAccessToken } from '../lib/accessTokenStore'
import { hasAdminRole } from './hasAdminRole'

const tokenWithRoles = (roles: string[]) =>
  `header.${btoa(JSON.stringify({ roles }))}.signature`

afterEach(() => setAccessToken(null))

it('derives the admin role from the current token', () => {
  expect(hasAdminRole()).toBe(false)

  setAccessToken(tokenWithRoles(['USER']))
  expect(hasAdminRole()).toBe(false)

  setAccessToken(tokenWithRoles(['ADMIN']))
  expect(hasAdminRole()).toBe(true)

  setAccessToken(null)
  expect(hasAdminRole()).toBe(false)
})

it('if a token cannnot be decoded, then say is not admin user', () => {
  setAccessToken('not-a-jwt')
  expect(hasAdminRole()).toBe(false)
})
