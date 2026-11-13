import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LoginForm } from './LoginForm'

describe('LoginForm', () => {
  it('keeps fields disabled after success without showing a pending label', () => {
    render(<LoginForm isSuccess />)
    expect(screen.getByLabelText('Email')).toBeDisabled()
    expect(screen.getByLabelText('Password')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Log In' })).toBeDisabled()
  })
  it('does not show errors while editing before the first submit', async () => {
    const user = userEvent.setup()

    render(<LoginForm />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    const emailInput = screen.getByLabelText('Email')

    await user.type(emailInput, 'jamie@example.com')
    await user.clear(emailInput)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(emailInput).toHaveAttribute('aria-invalid', 'false')
  })

  it('shows required errors after submitting an empty form', async () => {
    const user = userEvent.setup()
    const onValidSubmit = vi.fn()

    render(<LoginForm onValidSubmit={onValidSubmit} />)

    await user.click(screen.getByRole('button', { name: 'Log In' }))

    expect(screen.getByText('Please enter your email.')).toBeInTheDocument()

    expect(screen.getByText('Please enter your password.')).toBeInTheDocument()

    expect(screen.getByLabelText('Email')).toHaveAttribute(
      'aria-invalid',
      'true',
    )

    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(
      'Please enter your email.',
    )

    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(
      'Please enter your password.',
    )

    expect(onValidSubmit).not.toHaveBeenCalled()
  })

  it('updates errors when input changes after submitting', async () => {
    const user = userEvent.setup()

    render(<LoginForm />)

    await user.click(screen.getByRole('button', { name: 'Log In' }))

    const emailInput = screen.getByLabelText('Email')

    await user.type(emailInput, 'jamie@example.com')

    expect(
      screen.queryByText('Please enter your email.'),
    ).not.toBeInTheDocument()

    expect(emailInput).toHaveAttribute('aria-invalid', 'false')
    expect(emailInput).not.toHaveAttribute('aria-describedby')

    expect(screen.getByText('Please enter your password.')).toBeInTheDocument()

    await user.clear(emailInput)

    expect(screen.getByText('Please enter your email.')).toBeInTheDocument()
  })

  it('blocks a whitespace-only password', async () => {
    const user = userEvent.setup()
    const onValidSubmit = vi.fn()

    render(<LoginForm onValidSubmit={onValidSubmit} />)

    await user.type(screen.getByLabelText('Email'), 'jamie@example.com')
    await user.type(screen.getByLabelText('Password'), '   ')
    await user.click(screen.getByRole('button', { name: 'Log In' }))

    expect(screen.getByText('Please enter your password.')).toBeInTheDocument()

    expect(onValidSubmit).not.toHaveBeenCalled()
  })
})
