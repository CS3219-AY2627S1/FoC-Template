import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RemotePageProps } from '../src/remote/RemotePage'
import type { RemotePropsByService, RemoteServiceId } from '@relay/contracts'

const { pages, authFetch } = vi.hoisted(() => ({
  pages: new Map<string, RemotePageProps>(),
  authFetch: vi.fn(),
}))

// Replace only the federation boundary. Exercise the real host state and HTTP adapters.
vi.mock('../src/remote/RemotePage', () => ({
  RemotePage: (props: RemotePageProps) => {
    pages.set(props.service, props)
    return <section aria-label={props.service} hidden={!props.visible} />
  },
}))
vi.mock('@relay/user-auth-frontend-fetch', () => ({
  authFetch,
  refreshAccessToken: vi.fn(),
}))
import App from '../src/app/App'

const anchor = { top: 10, left: 20, right: 60, bottom: 50, width: 40, height: 40 }
const profile = { id: 'profile-id', username: 'Tester', profileCreated: true, role: 'user' }
const balance = {
  userId: 'subject-id',
  availableCredit: 100,
  reserveCredit: 0,
  lastUpdated: '2026-11-06',
}

function page<K extends RemoteServiceId>(service: K) {
  const value = pages.get(service)
  if (!value || value.service !== service) throw new Error(`Missing ${service} page`)
  return value as Extract<RemotePageProps, { service: K }>
}
function props<K extends RemoteServiceId>(service: K): RemotePropsByService[K] {
  return page(service).appProps as RemotePropsByService[K]
}

beforeEach(() => {
  pages.clear()
  authFetch.mockReset()
  authFetch.mockImplementation(async (url: string) => {
    if (url === '/api/auth/me')
      return Response.json({
        ok: true,
        data: {
          user: {
            subject: 'subject-id',
            email: 'tester@example.com',
            emailVerified: true,
            role: 'user',
          },
        },
      })
    if (url === '/api/user/me') return Response.json({ ok: true, data: profile })
    if (url === '/api/credit') return Response.json(balance)
    if (url === '/api/errands') return Response.json({ errand: { id: 'created' } })
    if (url === '/api/errands/open-errand/accept')
      return Response.json({ errand: { id: 'open-errand' } })
    throw new Error(`Unexpected request: ${url}`)
  })
})
afterEach(cleanup)

async function startMarketplace() {
  render(<App />)
  await waitFor(() => expect(props('credit').creditBalance).toEqual(balance))
  act(() => props('user').navigateTo('supplier'))
  expect(page('supplier').visible).toBe(true)
}

describe('host / remote integration', () => {
  it('composes service-specific dependencies and uses the host supplier API', async () => {
    await startMarketplace()
    expect(Object.keys(props('credit')).sort()).toEqual(
      [
        'authenticatedSubject',
        'authVersion',
        'closeCredit',
        'creditBalance',
        'creditHistoryOpen',
        'showCreditBalance',
        'showCreditHistory',
      ].sort(),
    )
    expect(props('supplier').supplierApi).toBe(props('errand').supplierApi)
    expect(props('supplier')).not.toHaveProperty('api')
    expect(props('user')).not.toHaveProperty('errandApi')
    expect(props('errand')).not.toHaveProperty('fetchSession')
  })

  it('opens and closes profile and credit overlays and switches credit history', async () => {
    await startMarketplace()
    act(() => props('supplier').openProfile(anchor))
    expect(page('user')).toMatchObject({ visible: true, overlay: true, bubbleAnchor: anchor })
    expect(props('user').presentation).toBe('card')
    act(() => props('user').closeProfile())
    expect(page('user').visible).toBe(false)
    act(() => props('supplier').openCredit(anchor))
    expect(page('credit')).toMatchObject({ visible: true, overlay: true, bubbleAnchor: anchor })
    act(() => props('credit').showCreditHistory())
    expect(props('credit').creditHistoryOpen).toBe(true)
    act(() => props('credit').showCreditBalance())
    expect(props('credit').creditHistoryOpen).toBe(false)
    act(() => props('credit').closeCredit())
    expect(page('credit').visible).toBe(false)
    act(() => props('supplier').openProfile(anchor))
    act(() => props('supplier').openCredit(anchor))
    expect(page('user').visible).toBe(false)
    expect(page('supplier').visible).toBe(true)
  })

  it('switches marketplace tabs and preserves the shared viewport through create and accept flows', async () => {
    await startMarketplace()
    const viewport = { center: { lat: 1.3, lng: 103.78 }, zoom: 18 }
    act(() => props('supplier').onMapViewportChange?.(viewport))
    act(() => props('supplier').openErrandView({ view: 'requests' }))
    expect(page('supplier').visible).toBe(false)
    expect(page('errand').visible).toBe(true)
    expect(props('errand').mapViewport).toEqual(viewport)
    expect(props('supplier').onMapViewportChange).toBeUndefined()
    expect(props('supplier').mapActive).toBe(false)
    act(() => props('errand').openErrandView({ view: 'my-errands' }))
    expect(props('errand').errandViewContext).toEqual({ view: 'my-errands' })
    act(() => props('errand').openErrandView({ view: 'explore' }))
    expect(page('supplier').visible).toBe(true)
    expect(props('supplier').supplierMode).toBe('explore')
    expect(props('supplier').mapViewport).toEqual(viewport)

    act(() => props('supplier').openErrandView({ view: 'create', anchor }))
    expect(page('supplier').visible).toBe(true)
    expect(page('errand')).toMatchObject({ visible: true, overlay: true })
    expect(props('errand').presentation).toBe('card')
    expect(props('errand').mapActive).toBe(false)
    expect(props('errand').onMapViewportChange).toBeUndefined()
    // Use the actual HTTP adapter supplied at the integration boundary.
    const request = { name: 'Test errand' } as Parameters<
      RemotePropsByService['errand']['errandApi']['createErrand']
    >[0]
    await props('errand').errandApi.createErrand(request)
    expect(authFetch).toHaveBeenCalledWith(
      '/api/errands',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(request) }),
    )
    act(() => props('errand').openErrandView({ view: 'requests' }))
    expect(page('errand').overlay).toBe(false)
    expect(props('errand').presentation).toBe('full')
    act(() => props('errand').openErrandView({ view: 'explore' }))
    await props('supplier').errandApi.acceptErrand('open-errand')
    expect(authFetch).toHaveBeenCalledWith(
      '/api/errands/open-errand/accept',
      expect.objectContaining({ method: 'POST' }),
    )
    act(() => props('supplier').onErrandAccepted())
    expect(page('errand').visible).toBe(true)
    expect(props('errand').errandViewContext).toEqual({ view: 'my-errands' })
    expect(props('errand').mapViewport).toEqual(viewport)
  })
})

it('routes supplier Updates through the host into an errand overlay and closes back to the supplier map', async () => {
  await startMarketplace()
  const viewport = { center: { lat: 1.3, lng: 103.78 }, zoom: 18 }
  act(() => props('supplier').onMapViewportChange?.(viewport))
  act(() => props('supplier').openErrandView({ view: 'updates', anchor }))
  expect(page('supplier').visible).toBe(true)
  expect(page('errand')).toMatchObject({ visible: true, overlay: true })
  expect(props('errand')).toMatchObject({
    presentation: 'card',
    mapActive: false,
    errandViewContext: { view: 'updates', anchor },
    mapViewport: viewport,
  })
  expect(props('errand').onMapViewportChange).toBeUndefined()
  expect(page('errand').overlayClassName).toBeUndefined()
  act(() => props('errand').navigateTo('supplier'))
  expect(page('supplier').visible).toBe(true)
  expect(page('errand')).toMatchObject({ visible: false, overlay: false })
  expect(props('errand').errandViewContext).toBeUndefined()
  expect(props('supplier').mapViewport).toEqual(viewport)
  act(() => props('supplier').openErrandView({ view: 'updates', anchor }))
  expect(page('errand')).toMatchObject({ visible: true, overlay: true })
})
