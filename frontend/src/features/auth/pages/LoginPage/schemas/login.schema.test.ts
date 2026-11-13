import { describe, expect, it } from 'vitest'
import { loginSchema } from './login.schema'

const validValues = {
  email: 'jamie@example.com',
  password: 'abcdefgh',
}

describe('loginSchema', () => {
  it('accepts valid login values', () => {
    const result = loginSchema.safeParse(validValues)

    expect(result.success).toBe(true)
  })

  it('normalizes the email', () => {
    const result = loginSchema.safeParse({
      ...validValues,
      email: '  JAMIE@EXAMPLE.COM  ',
    })

    expect(result.success).toBe(true)

    if (result.success) {
      expect(result.data.email).toBe('jamie@example.com')
    }
  })

  it.each(['', '   '])('rejects a blank email: %j', (email) => {
    const result = loginSchema.safeParse({
      ...validValues,
      email,
    })

    expect(result.success).toBe(false)

    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['email'],
            message: 'Please enter your email.',
          }),
        ]),
      )
    }
  })

  it.each(['', '   ', '\t\n'])('rejects a blank password: %j', (password) => {
    const result = loginSchema.safeParse({
      ...validValues,
      password,
    })

    expect(result.success).toBe(false)

    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['password'],
            message: 'Please enter your password.',
          }),
        ]),
      )
    }
  })

  it('does not apply the registration password length rule', () => {
    const result = loginSchema.safeParse({
      ...validValues,
      password: 'abc',
    })

    expect(result.success).toBe(true)
  })

  it('preserves spaces in a nonblank password', () => {
    const password = ' abcdefgh '

    const result = loginSchema.safeParse({
      ...validValues,
      password,
    })

    expect(result.success).toBe(true)

    if (result.success) {
      expect(result.data.password).toBe(password)
    }
  })
})
