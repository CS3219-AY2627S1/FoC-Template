import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RegisterForm } from './RegisterForm'

describe('RegisterForm', () => {
  it('does not show errors while editing before the first submit', async () => {
    const user = userEvent.setup()

    render(<RegisterForm />)

    expect(
      screen.queryByText('Please use your NUS email address.'),
    ).not.toBeInTheDocument()

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Password'), 'abc')
    await user.type(screen.getByLabelText('Confirm password'), 'xyz')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows one required error per field and blocks submission', async () => {
    const user = userEvent.setup()
    const onValidSubmit = vi.fn()

    render(<RegisterForm onValidSubmit={onValidSubmit} />)

    await user.click(screen.getByRole('button', { name: 'Create Account' }))

    expect(screen.getAllByRole('alert')).toHaveLength(4)

    expect(screen.getByLabelText('Name')).toHaveAccessibleDescription(
      'Please enter your name.',
    )

    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(
      'Please enter your email.',
    )

    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(
      'Please enter your password.',
    )

    expect(
      screen.getByLabelText('Confirm password'),
    ).toHaveAccessibleDescription('Please confirm your password.')

    expect(
      screen.queryByText('Password must contain at least 8 characters.'),
    ).not.toBeInTheDocument()

    expect(onValidSubmit).not.toHaveBeenCalled()
  })

  it('rechecks matching passwords when either password changes', async () => {
    const user = userEvent.setup()
    const onValidSubmit = vi.fn()

    render(<RegisterForm onValidSubmit={onValidSubmit} />)

    const passwordInput = screen.getByLabelText('Password')
    const confirmInput = screen.getByLabelText('Confirm password')

    await user.type(screen.getByLabelText('Name'), 'Jamie')
    await user.type(screen.getByLabelText('Email'), 'jamie@u.nus.edu')
    await user.type(passwordInput, 'abcdefgh')
    await user.type(confirmInput, 'different')

    await user.click(screen.getByRole('button', { name: 'Create Account' }))

    expect(confirmInput).toHaveAccessibleDescription('Passwords do not match.')
    expect(onValidSubmit).not.toHaveBeenCalled()

    await user.clear(confirmInput)
    await user.type(confirmInput, 'abcdefgh')

    expect(
      screen.queryByText('Passwords do not match.'),
    ).not.toBeInTheDocument()
    expect(confirmInput).toHaveAttribute('aria-invalid', 'false')
    expect(confirmInput).not.toHaveAttribute('aria-describedby')

    await user.type(passwordInput, 'x')

    expect(confirmInput).toHaveAccessibleDescription('Passwords do not match.')

    await user.type(confirmInput, 'x')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    // Correcting input must not submit automatically.
    expect(onValidSubmit).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Create Account' }))

    expect(onValidSubmit).toHaveBeenCalledTimes(1)
  })

  it('shows an invalid email error and clears it after correction', async () => {
    const user = userEvent.setup()
    const onValidSubmit = vi.fn()

    render(<RegisterForm onValidSubmit={onValidSubmit} />)

    const emailInput = screen.getByLabelText('Email')

    await user.type(screen.getByLabelText('Name'), 'Jamie')
    await user.type(emailInput, 'invalid')
    await user.type(screen.getByLabelText('Password'), 'abcdefgh')
    await user.type(screen.getByLabelText('Confirm password'), 'abcdefgh')

    await user.click(screen.getByRole('button', { name: 'Create Account' }))

    expect(emailInput).toHaveAccessibleDescription(
      'Please enter a valid email address.',
    )
    expect(onValidSubmit).not.toHaveBeenCalled()

    await user.clear(emailInput)
    await user.type(emailInput, 'jamie@gmail.com')

    expect(emailInput).toHaveAccessibleDescription(
      'Please use your NUS email address.',
    )
    expect(onValidSubmit).not.toHaveBeenCalled()

    await user.clear(emailInput)
    await user.type(emailInput, 'jamie@u.nus.edu')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(onValidSubmit).not.toHaveBeenCalled()
  })
})
