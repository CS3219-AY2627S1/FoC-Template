import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError } from 'axios'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AuthRouterProvider } from '#/App'
import { routeTree } from '#/routes'
import { AuthProvider } from '../../providers/AuthProvider'
import { getAccessToken, setAccessToken } from '../../lib/accessTokenStore'
import { logoutUser } from '../../api/logoutUser.api'
import * as api from '../../api/userProfile.api'
import { getFaculties } from '#/api/getFaculties.api'

vi.mock('../../api/userProfile.api')
vi.mock('#/api/getFaculties.api')
vi.mock('../../api/logoutUser.api', () => ({ logoutUser: vi.fn() }))
vi.mock('#/features/credits/api/credits.api', () => ({
  getCreditBalance: vi.fn(async () => ({
    availableBalance: 15,
    reservedBalance: 0,
  })),
}))

const profile = {
  id: '1',
  name: 'Alex Tan',
  email: 'alex@example.com',
  roles: ['USER'],
  phoneNumber: '+6591235436',
  faculty: 'School of Computing',
  avatarUrl: null,
}
const clients: QueryClient[] = []
const accessToken = `header.${btoa(JSON.stringify({ sub: '1', roles: ['USER'] }))}.signature`

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  setAccessToken(accessToken)
  vi.mocked(api.getUserProfile).mockResolvedValue(profile)
  vi.mocked(getFaculties).mockResolvedValue([
    'School of Computing',
    'Faculty of Science',
  ])
  vi.mocked(api.updateUserProfile).mockImplementation(async (request) => ({
    ...profile,
    ...request,
  }))
  vi.mocked(logoutUser).mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  clients.forEach((client) => client.clear())
  clients.length = 0
  setAccessToken(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const setup = async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  const router = createRouter({
    routeTree,
    context: { auth: undefined! },
    history: createMemoryHistory({ initialEntries: ['/profile/edit'] }),
  })
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <AuthRouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  )
  await screen.findByRole('heading', { name: 'Edit Profile' })
  return { router, client, user: userEvent.setup() }
}

it('loads the profile and saves optional fields, updating the header', async () => {
  const { user } = await setup()
  await user.clear(screen.getByLabelText(/Full Name/))
  await user.type(screen.getByLabelText(/Full Name/), 'Jamie Tan')
  await user.clear(screen.getByLabelText('Phone Number'))
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  await screen.findByText('Profile saved.')
  expect(api.updateUserProfile).toHaveBeenCalledWith(
    {
      name: 'Jamie Tan',
      phoneNumber: '',
      faculty: 'School of Computing',
    },
    expect.anything(),
  )
  expect(api.changePassword).not.toHaveBeenCalled()
  expect(
    screen.getByRole('button', { name: 'Open account for Jamie Tan' }),
  ).toBeInTheDocument()
})

it('shows backend field errors without reporting success', async () => {
  vi.mocked(api.updateUserProfile).mockRejectedValue(
    new AxiosError('Bad request', undefined, undefined, undefined, {
      data: {
        message: 'Validation failed',
        fieldErrors: { phoneNumber: 'Include a country code.' },
      },
      status: 400,
      statusText: 'Bad Request',
      headers: {},
      config: {} as never,
    }),
  )
  const { user } = await setup()
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  expect(await screen.findByText('Include a country code.')).toBeInTheDocument()
  expect(screen.getByLabelText('Phone Number')).toHaveAttribute(
    'aria-invalid',
    'true',
  )
  expect(screen.queryByText('Profile saved.')).not.toBeInTheDocument()
})

it('does not submit incomplete password changes', async () => {
  const { user } = await setup()
  await user.type(screen.getByLabelText('New password'), 'NewPassword2')
  await user.click(screen.getByRole('button', { name: 'Change Password' }))
  expect(
    await screen.findByText('Enter your current password.'),
  ).toBeInTheDocument()
  expect(api.updateUserProfile).not.toHaveBeenCalled()
  expect(api.changePassword).not.toHaveBeenCalled()
})

it('saves profile details independently of incomplete password fields', async () => {
  const { user } = await setup()
  await user.type(screen.getByLabelText('New password'), 'short')
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  await screen.findByText('Profile saved.')
  expect(api.updateUserProfile).toHaveBeenCalledOnce()
  expect(api.changePassword).not.toHaveBeenCalled()
  expect(logoutUser).not.toHaveBeenCalled()
  expect(screen.getByLabelText('New password')).toHaveValue('short')
})

it('shows password errors without saving profile changes', async () => {
  vi.mocked(api.changePassword).mockRejectedValue(
    new AxiosError('Bad request', undefined, undefined, undefined, {
      data: {
        message: 'Validation failed',
        fieldErrors: { currentPassword: 'Current password is incorrect' },
      },
      status: 400,
      statusText: 'Bad Request',
      headers: {},
      config: {} as never,
    }),
  )
  const { user } = await setup()
  await user.type(screen.getByLabelText('Current password'), 'WrongPassword1')
  await user.type(screen.getByLabelText('New password'), 'NewPassword2')
  await user.click(screen.getByRole('button', { name: 'Change Password' }))
  expect(
    await screen.findByText('Current password is incorrect'),
  ).toBeInTheDocument()
  expect(api.updateUserProfile).not.toHaveBeenCalled()
  expect(screen.queryByText('Profile saved.')).not.toBeInTheDocument()
  expect(logoutUser).not.toHaveBeenCalled()
})

it('ends the session and clears profile cache after changing the password', async () => {
  const { user, router, client } = await setup()
  await user.clear(screen.getByLabelText(/Full Name/))
  await user.type(screen.getByLabelText('Current password'), 'CurrentPassword1')
  await user.type(screen.getByLabelText('New password'), 'NewPassword2')
  await user.click(screen.getByRole('button', { name: 'Change Password' }))
  await screen.findByRole('heading', { name: 'Welcome Back' })
  expect(router.state.location.pathname).toBe('/login')
  expect(getAccessToken()).toBeNull()
  expect(client.getQueryData(['current-user', 'profile'])).toBeUndefined()
  expect(api.updateUserProfile).not.toHaveBeenCalled()
  expect(api.changePassword).toHaveBeenCalledWith(
    { currentPassword: 'CurrentPassword1', newPassword: 'NewPassword2' },
    expect.anything(),
  )
})

it('renders the direct avatar URL, uploads a photo, and removes it', async () => {
  vi.mocked(api.uploadAvatar).mockResolvedValue({
    ...profile,
    avatarUrl: '/api/users/1/avatar?v=new-key.png',
  })
  const { user } = await setup()
  const photo = new File(['photo'], 'avatar.png', { type: 'image/png' })
  await user.upload(screen.getByLabelText('Profile photo'), photo)
  await screen.findByText('Photo updated.')
  await waitFor(() =>
    expect(screen.getByAltText('Alex Tan')).toHaveAttribute(
      'src',
      '/api/users/1/avatar?v=new-key.png',
    ),
  )
  await user.click(screen.getByRole('button', { name: 'Remove' }))
  await screen.findByText('Photo removed.')
  expect(screen.queryByAltText('Alex Tan')).not.toBeInTheDocument()
})

it('requests and resends an email change in place without saving the profile or ending the session', async () => {
  vi.mocked(api.requestEmailChange).mockResolvedValue(undefined)
  const { user, router } = await setup()
  await user.type(
    screen.getByLabelText('New email address'),
    ' NEW@NUS.EDU.SG ',
  )
  await user.click(
    screen.getByRole('button', { name: 'Send verification email' }),
  )
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Check new@nus.edu.sg',
  )
  expect(screen.getByRole('status')).toHaveTextContent('inbox and spam')
  expect(api.requestEmailChange).toHaveBeenCalledWith(
    'new@nus.edu.sg',
    expect.anything(),
  )
  await user.click(
    screen.getByRole('button', { name: 'Resend verification email' }),
  )
  await waitFor(() => expect(api.requestEmailChange).toHaveBeenCalledTimes(2))
  await waitFor(() =>
    expect(screen.getByLabelText('New email address')).not.toBeDisabled(),
  )
  await user.clear(screen.getByLabelText('New email address'))
  await user.type(
    screen.getByLabelText('New email address'),
    'different@u.nus.edu',
  )
  expect(
    screen.getByRole('button', { name: 'Send verification email' }),
  ).toBeInTheDocument()
  expect(api.updateUserProfile).not.toHaveBeenCalled()
  expect(api.changePassword).not.toHaveBeenCalled()
  expect(logoutUser).not.toHaveBeenCalled()
  expect(getAccessToken()).toBe(accessToken)
  expect(router.state.location.pathname).toBe('/profile/edit')
})

it('shows an email request error inline and allows another attempt', async () => {
  vi.mocked(api.requestEmailChange)
    .mockRejectedValueOnce(
      new AxiosError('Conflict', undefined, undefined, undefined, {
        data: { message: 'This email address is already in use.' },
        status: 409,
        statusText: 'Conflict',
        headers: {},
        config: {} as never,
      }),
    )
    .mockResolvedValueOnce(undefined)
  const { user } = await setup()
  await user.type(screen.getByLabelText('New email address'), 'taken@u.nus.edu')
  await user.click(
    screen.getByRole('button', { name: 'Send verification email' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent('already in use')
  await user.clear(screen.getByLabelText('New email address'))
  await user.type(screen.getByLabelText('New email address'), 'free@u.nus.edu')
  await user.click(
    screen.getByRole('button', { name: 'Send verification email' }),
  )
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Check free@u.nus.edu',
  )
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
