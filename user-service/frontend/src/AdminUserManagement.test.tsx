import { expect, test, vi } from 'vitest'
import { render, screen, waitForElementToBeRemoved } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { AdminUserManagement } from './AdminUserManagement'
import { saveSession } from './auth/session'

const adminId = 'c3e8d15c-0bb4-443f-989e-b6fda9f38993'
const requesterId = 'e3f9bc4c-611e-4efa-aa82-d64bcbd86a2d'

test('reactivates through User management only after a reason and confirmation', async () => {
  saveSession({accessToken:'admin.jwt',tokenType:'Bearer',expiresAt:'2030-01-01T00:15:00Z',userId:adminId,username:'Admin',role:'ADMIN',availableRoles:['ADMIN']})
  const account={userId:requesterId,email:'alice@u.nus.edu',username:'Alice',roles:['REQUESTER'],status:'BANNED',createdAt:'2030-01-02T00:00:00Z'}
  const fetcher=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({content:[account],page:0,size:20,totalElements:1,totalPages:1})})
    .mockResolvedValueOnce({ok:true,json:async()=>({...account,status:'ACTIVE'})})
  vi.stubGlobal('fetch',fetcher)
  render(<AdminUserManagement currentUserId={adminId} />)
  const user=userEvent.setup()
  await user.click(await screen.findByRole('button',{name:'Reactivate'}))
  expect(screen.getByRole('button',{name:'Confirm reactivation'})).toBeDisabled()
  expect(screen.getByLabelText('Reason for reactivation')).toHaveFocus()
  await user.type(screen.getByLabelText('Reason for reactivation'),'Appeal reviewed')
  await user.click(screen.getByRole('button',{name:'Confirm reactivation'}))
  expect(await screen.findByText('Alice has been reactivated.')).toBeInTheDocument()
  expect(fetcher.mock.calls[1][1].body).toBe(JSON.stringify({status:'ACTIVE',reason:'Appeal reviewed'}))
})

test('lets an administrator promote an active account without developer tools', async () => {
  saveSession({
    accessToken: 'admin.jwt', tokenType: 'Bearer', expiresAt: '2030-01-01T00:15:00Z',
    userId: adminId, username: 'Admin', role: 'ADMIN', availableRoles: ['REQUESTER', 'ADMIN'],
  })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({
      content: [
        { userId: adminId, email: 'admin@u.nus.edu', username: 'Admin', roles: ['REQUESTER', 'ADMIN'], status: 'ACTIVE', createdAt: '2030-01-01T00:00:00Z' },
        { userId: requesterId, email: 'alice@u.nus.edu', username: 'Alice', roles: ['REQUESTER'], status: 'ACTIVE', createdAt: '2030-01-02T00:00:00Z' },
      ],
      page: 0, size: 20, totalElements: 2, totalPages: 1,
    }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({
      userId: requesterId, email: 'alice@u.nus.edu', username: 'Alice', roles: ['REQUESTER', 'ADMIN'], status: 'ACTIVE', createdAt: '2030-01-02T00:00:00Z',
    }) }))

  render(<AdminUserManagement currentUserId={adminId} />)
  const user = userEvent.setup()

  expect(await screen.findByText('alice@u.nus.edu')).toBeInTheDocument()
  expect(screen.getByText('Current account')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Promote to Admin' }))

  expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to promote Alice?')
  expect(await screen.findByText('Alice is now an administrator.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Remove Admin' })).toBeInTheDocument()
  expect(fetch).toHaveBeenLastCalledWith(`/api/users/admin/accounts/${requesterId}/role`, expect.objectContaining({ method: 'PATCH' }))
  await waitForElementToBeRemoved(() => screen.queryByText('Alice is now an administrator.'), { timeout: 4000 })
  expect(screen.getByRole('button', { name: 'Remove Admin' })).toBeInTheDocument()
})
