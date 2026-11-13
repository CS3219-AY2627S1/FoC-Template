import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { CreditRemoteProps, RemoteServiceId } from '@relay/contracts'

const { received } = vi.hoisted(() => ({ received: vi.fn() }))
vi.mock('../src/remote/RemoteLoader', () => ({
  loadServiceRemote: async (service: RemoteServiceId) => ({
    default: (props: CreditRemoteProps) => {
      received(service, props)
      return <button onClick={props.showCreditHistory}>Remote credit history</button>
    },
  }),
}))
import { RemotePage } from '../src/remote/RemotePage'

afterEach(cleanup)

it('loads the matching remote and forwards its contract through the lazy boundary', async () => {
  const appProps: CreditRemoteProps = {
    creditBalance: null,
    authVersion: 1,
    creditHistoryOpen: false,
    closeCredit: vi.fn(),
    showCreditHistory: vi.fn(),
    showCreditBalance: vi.fn(),
  }
  render(<RemotePage service="credit" serviceLabel="Credits" visible appProps={appProps} />)
  const button = await screen.findByRole('button', { name: 'Remote credit history' })
  expect(received).toHaveBeenLastCalledWith('credit', appProps)
  button.click()
  expect(appProps.showCreditHistory).toHaveBeenCalledOnce()
})
