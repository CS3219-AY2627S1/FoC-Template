import { describe, expect, it } from 'vitest'
import { registerSchema } from './register.schema'

const validValues = {
  name: 'Jamie Loh',
  email: 'jamie@u.nus.edu',
  password: 'abcdefgh',
  confirmPassword: 'abcdefgh',
}

describe('registerSchema', () => {
  it.each(['jamie@u.nus.edu', 'jamie@nus.edu.sg'])('accepts %s', (email) => {
    const result = registerSchema.safeParse({ ...validValues, email })

    expect(result.success).toBe(true)
  })

  it.each(['jamie@gmail.com', 'jamie@u.nus.edu.example.com'])(
    'rejects an unsupported domain: %s',
    (email) => {
      const result = registerSchema.safeParse({ ...validValues, email })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Please use your NUS email address.',
        )
      }
    },
  )

  it('normalizes the name and email', () => {
    const result = registerSchema.safeParse({
      ...validValues,
      name: '  Jamie Loh  ',
      email: '  JAMIE@U.NUS.EDU  ',
    })

    expect(result.success).toBe(true)

    if (result.success) {
      expect(result.data.name).toBe('Jamie Loh')
      expect(result.data.email).toBe('jamie@u.nus.edu')
    }
  })

  it.each(['', '   '])('rejects a blank name: %j', (name) => {
    const result = registerSchema.safeParse({
      ...validValues,
      name,
    })

    expect(result.success).toBe(false)

    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: ['name'] })]),
      )
    }
  })

  it.each(['', 'jamie', 'jamie@', 'jamie@u.nus.edu extra'])(
    'rejects an invalid email: %j',
    (email) => {
      const result = registerSchema.safeParse({
        ...validValues,
        email,
      })

      expect(result.success).toBe(false)

      if (!result.success) {
        expect(result.error.issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ path: ['email'] }),
          ]),
        )
      }
    },
  )

  it('rejects a seven-character password', () => {
    const result = registerSchema.safeParse({
      ...validValues,
      password: 'abcdefg',
      confirmPassword: 'abcdefg',
    })

    expect(result.success).toBe(false)

    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ['password'] }),
        ]),
      )
    }
  })

  it.each([
    { length: 36, accepted: true },
    { length: 37, accepted: false },
  ])(
    'checks the UTF-8 byte limit for $length accented characters',
    ({ length, accepted }) => {
      const password = 'é'.repeat(length)
      const result = registerSchema.safeParse({
        ...validValues,
        password,
        confirmPassword: password,
      })
      expect(result.success).toBe(accepted)
    },
  )

  it.each(['', '        ', '\t\t\t\t\t\t\t\t', '\n\n\n\n\n\n\n\n'])(
    'reports the required error first for a blank password: %j',
    (password) => {
      const result = registerSchema.safeParse({
        ...validValues,
        password,
        confirmPassword: password,
      })

      expect(result.success).toBe(false)

      if (!result.success) {
        const passwordIssue = result.error.issues.find(
          (issue) => issue.path[0] === 'password',
        )

        expect(passwordIssue?.message).toBe('Please enter your password.')
      }
    },
  )

  it('assigns a password mismatch to confirmPassword', () => {
    const result = registerSchema.safeParse({
      ...validValues,
      confirmPassword: 'different-password',
    })

    expect(result.success).toBe(false)

    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['confirmPassword'],
            message: 'Passwords do not match.',
          }),
        ]),
      )
    }
  })

  it.each(['', '        ', '\t\t\t\t\t\t\t\t', '\n\n\n\n\n\n\n\n'])(
    'rejects a blank confirmation password: %j',
    (confirmPassword) => {
      const result = registerSchema.safeParse({
        ...validValues,
        confirmPassword,
      })

      expect(result.success).toBe(false)

      if (!result.success) {
        expect(result.error.issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: ['confirmPassword'],
              message: 'Please confirm your password.',
            }),
          ]),
        )
      }
    },
  )

  it.each([' abcdefgh ', 'abcd efgh'])(
    'preserves spaces in passwords: %j',
    (password) => {
      const result = registerSchema.safeParse({
        ...validValues,
        password,
        confirmPassword: password,
      })

      expect(result.success).toBe(true)

      if (result.success) {
        expect(result.data.password).toBe(password)
        expect(result.data.confirmPassword).toBe(password)
      }
    },
  )
})
