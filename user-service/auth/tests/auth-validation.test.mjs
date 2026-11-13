/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-28
 * Scope: Generated authentication input validation tests
 * Author review: Verified edge cases are covered.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

process.env.AUTH_BOOTSTRAP_ADMIN_EMAIL = 'admin@example.com'
const { registerSchema, loginSchema, passwordSchema } =
  await import('../dist/validators/auth.validator.js')
const validPassword = 'Test1234!'
const register = (email, password = validPassword) =>
  registerSchema.safeParse({ email, password, passwordConfirmation: password })

test('registration accepts both frontend NUS email domains and only the configured bootstrap admin exception', () => {
  assert.equal(register('student@u.nus.edu').success, true)
  assert.equal(register('staff@nus.edu.sg').success, true)
  assert.equal(register('admin@example.com').success, true)
  for (const email of [
    'student@example.com',
    'not-an-email',
    'student@nus.edu',
    ' admin2@example.com ',
    ' student@u.nus.edu ',
  ]) {
    assert.equal(register(email).success, false, email)
  }
  assert.equal(
    loginSchema.safeParse({ email: 'admin@example.com', password: validPassword }).success,
    true,
  )
})

test('registration and new passwords require the same five password rules as the frontend', () => {
  for (const candidate of ['Aa1!', 'ABCDEFG1!', 'abcdefg1!', 'Abcdefgh!', 'Abcdefg12']) {
    assert.equal(register('student@u.nus.edu', candidate).success, false, candidate)
    assert.equal(
      passwordSchema.safeParse({
        currentPassword: validPassword,
        newPassword: candidate,
        newPasswordConfirmation: candidate,
      }).success,
      false,
      candidate,
    )
  }
  assert.equal(register('student@u.nus.edu', validPassword).success, true)
  assert.equal(
    loginSchema.safeParse({ email: 'student@u.nus.edu', password: 'legacy' }).success,
    true,
  )
})
