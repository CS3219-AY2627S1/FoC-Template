import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { supplierApi } from './api/client'

const supplierId = 'ca9bd61f-93da-4500-9e9d-48de1bea52fa'
const secondSupplierId = '184a5d15-0714-47ad-9ee9-524bf84f361c'

const activeSupplier = {
  id: supplierId,
  name: 'Campus Coffee',
  type: 'Food/Coffee',
  building: 'COM3',
  floor: '1',
  locationDescription: 'Beside the entrance',
  latitude: 1.2948,
  longitude: 103.7716,
  openingTime: '08:00:00',
  closingTime: '18:00:00',
  imageUrl: 'https://example.com/cafe.jpg',
  imageSource: 'EXTERNAL_URL',
  status: 'ACTIVE',
  version: 0,
  createdAt: '2026-09-23T00:00:00Z',
  updatedAt: '2026-09-23T00:00:00Z',
}

const inactiveSupplier = {
  ...activeSupplier,
  id: secondSupplierId,
  name: 'Former Shop',
  type: 'Shopping',
  imageUrl: null,
  imageSource: null,
  status: 'INACTIVE',
  version: 1,
}

function response(body: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function successfulResult(body: unknown, status = 200) {
  const apiResponse = response(body, status)
  return { data: body, response: apiResponse } as never
}

function failedResult(body: unknown, status: number) {
  const apiResponse = response(body, status)
  return { error: body, response: apiResponse } as never
}

function mockReads(options?: { listFailure?: boolean; empty?: boolean }) {
  return vi.spyOn(supplierApi, 'GET').mockImplementation(async (...args) => {
    const path = String(args[0])
    const request = args[1] as
      { params?: { path?: { id?: string } } } | undefined
    if (path === '/api/admin/suppliers/metadata') {
      return successfulResult({
        types: ['Food/Coffee', 'Shopping'],
        buildings: ['COM3'],
      })
    }
    if (path === '/api/admin/suppliers') {
      if (options?.listFailure) {
        return failedResult({ detail: 'Database unavailable' }, 503)
      }
      const items = options?.empty ? [] : [activeSupplier, inactiveSupplier]
      return successfulResult({
        items,
        page: 0,
        size: 20,
        totalItems: items.length,
        totalPages: items.length ? 2 : 0,
      })
    }
    if (
      path === '/api/suppliers/{id}' &&
      request?.params?.path?.id === supplierId
    ) {
      return successfulResult(activeSupplier)
    }
    return failedResult({ title: 'Supplier not found' }, 404)
  })
}

function LocationProbe() {
  const location = useLocation()
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  )
}

function renderRoute(route: string) {
  sessionStorage.setItem(
    'foc.user-session',
    JSON.stringify({
      accessToken: 'admin.jwt',
      tokenType: 'Bearer',
      expiresAt: '2030-01-01T00:15:00Z',
      userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993',
      username: 'Admin',
      role: 'ADMIN',
    }),
  )
  sessionStorage.setItem('foc.ui-mode', 'admin')
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <App />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Administrative supplier management', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders active and inactive records and synchronises filters with the URL', async () => {
    const get = mockReads()
    const user = userEvent.setup()
    renderRoute('/admin/suppliers')

    expect(await screen.findAllByText('Campus Coffee')).toHaveLength(2)
    expect(screen.getAllByText('Former Shop')).toHaveLength(2)
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Inactive').length).toBeGreaterThan(0)

    await user.selectOptions(screen.getByLabelText('Status'), 'INACTIVE')
    await user.selectOptions(screen.getByLabelText('Sort by'), 'status,desc')
    expect(screen.getByTestId('location')).toHaveTextContent('status=INACTIVE')
    expect(screen.getByTestId('location')).toHaveTextContent(
      'sort=status%2Cdesc',
    )
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByTestId('location')).toHaveTextContent('page=1')

    const calls = get.mock.calls as unknown as Array<
      [string, { params?: { query?: Record<string, unknown> } }]
    >
    const adminCall = calls.find(([path]) => path === '/api/admin/suppliers')
    expect(adminCall?.[1]).toMatchObject({
      params: { query: { page: 0, size: 20, sort: 'name,asc' } },
    })
  })

  it('debounces administrative search and keeps it in the URL', async () => {
    mockReads()
    const user = userEvent.setup()
    renderRoute('/admin/suppliers?page=1')
    await screen.findAllByText('Campus Coffee')

    await user.type(screen.getByLabelText('Search suppliers'), 'coffee')
    await waitFor(
      () =>
        expect(screen.getByTestId('location')).toHaveTextContent(
          'search=coffee',
        ),
      { timeout: 1000 },
    )
    expect(screen.getByTestId('location')).not.toHaveTextContent('page=1')
  })

  it('creates a normalized supplier and returns with success feedback', async () => {
    mockReads()
    const post = vi
      .spyOn(supplierApi, 'POST')
      .mockResolvedValue(successfulResult(activeSupplier))
    const user = userEvent.setup()
    renderRoute('/admin/suppliers/new')

    await user.type(screen.getByLabelText('Name'), '  Campus Coffee  ')
    await user.type(screen.getByLabelText('Category'), ' Food/Coffee ')
    await user.type(screen.getByLabelText('Building'), ' COM3 ')
    await user.type(screen.getByLabelText('Floor'), '   ')
    await user.type(screen.getByLabelText('Latitude'), '1.2948')
    await user.type(screen.getByLabelText('Longitude'), '103.7716')
    await user.selectOptions(
      screen.getByLabelText('Initial status'),
      'INACTIVE',
    )
    await user.click(screen.getByRole('button', { name: 'Create supplier' }))

    await waitFor(() => expect(post).toHaveBeenCalledOnce())
    expect(post.mock.calls[0]?.[1]).toMatchObject({
      body: {
        name: 'Campus Coffee',
        type: 'Food/Coffee',
        building: 'COM3',
        floor: null,
        latitude: 1.2948,
        longitude: 103.7716,
        status: 'INACTIVE',
      },
    })
    expect(await screen.findByText(/created successfully/i)).toBeInTheDocument()
  })

  it('validates required fields and coordinates before creating', async () => {
    mockReads()
    const post = vi.spyOn(supplierApi, 'POST')
    const user = userEvent.setup()
    renderRoute('/admin/suppliers/new')
    await user.click(screen.getByRole('button', { name: 'Create supplier' }))

    expect(await screen.findByText('Name is required.')).toBeInTheDocument()
    expect(screen.getByText('Latitude is required.')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('creates a supplier and uploads a selected image to the protected endpoint', async () => {
    mockReads()
    const created = {
      ...activeSupplier,
      imageUrl: null,
      imageSource: null,
      version: 0,
    }
    vi.spyOn(supplierApi, 'POST').mockResolvedValue(successfulResult(created))
    const fetch = vi.fn().mockResolvedValue(
      response({
        ...created,
        imageUrl: `/api/suppliers/${supplierId}/image?v=1`,
        imageSource: 'UPLOAD',
        version: 1,
      }),
    )
    vi.stubGlobal('fetch', fetch)
    const user = userEvent.setup()
    renderRoute('/admin/suppliers/new')

    await user.type(screen.getByLabelText('Name'), 'Campus Coffee')
    await user.type(screen.getByLabelText('Category'), 'Food/Coffee')
    await user.type(screen.getByLabelText('Building'), 'COM3')
    await user.type(screen.getByLabelText('Latitude'), '1.2948')
    await user.type(screen.getByLabelText('Longitude'), '103.7716')
    await user.click(screen.getByLabelText('Upload from device'))
    const file = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      'campus.png',
      { type: 'image/png' },
    )
    await user.upload(screen.getByLabelText('Choose image file'), file)
    await user.click(screen.getByRole('button', { name: 'Create supplier' }))

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    const request = fetch.mock.calls[0]?.[0] as Request
    expect(request.method).toBe('PUT')
    expect(request.url).toContain(
      `/api/admin/suppliers/${supplierId}/image?version=0`,
    )
    expect(request.headers.get('Authorization')).toBe('Bearer admin.jwt')
    expect(request.body).not.toBeNull()
    expect(await screen.findByText(/created successfully/i)).toBeInTheDocument()
  })

  it('maps backend field errors without discarding entered form data', async () => {
    mockReads()
    vi.spyOn(supplierApi, 'POST').mockResolvedValue(
      failedResult(
        {
          title: 'Invalid supplier request',
          detail: 'One or more supplier fields are invalid',
          errors: { name: ['Name is already unavailable.'] },
        },
        400,
      ),
    )
    const user = userEvent.setup()
    renderRoute('/admin/suppliers/new')
    await user.type(screen.getByLabelText('Name'), 'Campus Coffee')
    await user.type(screen.getByLabelText('Category'), 'Food')
    await user.type(screen.getByLabelText('Building'), 'COM3')
    await user.type(screen.getByLabelText('Latitude'), '1.29')
    await user.type(screen.getByLabelText('Longitude'), '103.77')
    await user.click(screen.getByRole('button', { name: 'Create supplier' }))

    expect(
      await screen.findByText('Name is already unavailable.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Campus Coffee')
  })

  it('performs a full update with the loaded version and clears optional fields', async () => {
    mockReads()
    const put = vi.spyOn(supplierApi, 'PUT').mockResolvedValue(
      successfulResult({
        ...activeSupplier,
        name: 'Updated Coffee',
        imageUrl: null,
        imageSource: null,
        version: 1,
      }),
    )
    const removeImage = vi.spyOn(supplierApi, 'DELETE').mockResolvedValue(
      successfulResult({
        ...activeSupplier,
        name: 'Updated Coffee',
        imageUrl: null,
        imageSource: null,
        version: 1,
      }),
    )
    const user = userEvent.setup()
    renderRoute(`/admin/suppliers/${supplierId}/edit`)

    const name = await screen.findByLabelText('Name')
    await user.clear(name)
    await user.type(name, ' Updated Coffee ')
    await user.clear(screen.getByLabelText('Floor'))
    await user.click(screen.getByLabelText('No photo'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(put).toHaveBeenCalledOnce())
    expect(put.mock.calls[0]?.[1]).toMatchObject({
      params: { path: { id: supplierId } },
      body: {
        name: 'Updated Coffee',
        floor: null,
        imageUrl: null,
        version: 0,
      },
    })
    expect(put.mock.calls[0]?.[1]).not.toHaveProperty('body.status')
    await waitFor(() => expect(removeImage).toHaveBeenCalledOnce())
    expect(removeImage.mock.calls[0]?.[1]).toMatchObject({
      params: {
        path: { id: supplierId },
        query: { version: 1 },
      },
    })
  })

  it('shows a friendly missing state for an unavailable edit record', async () => {
    mockReads()
    renderRoute(`/admin/suppliers/${secondSupplierId}/edit`)
    expect(await screen.findByText('Supplier not found')).toBeInTheDocument()
    expect(screen.getByText(/may have been deleted/i)).toBeInTheDocument()
  })

  it('confirms status changes and invalidates public supplier queries', async () => {
    mockReads()
    const patch = vi
      .spyOn(supplierApi, 'PATCH')
      .mockResolvedValue(
        successfulResult({ ...activeSupplier, status: 'INACTIVE', version: 1 }),
      )
    const user = userEvent.setup()
    renderRoute('/admin/suppliers')

    await screen.findAllByText('Campus Coffee')
    await user.click(screen.getAllByRole('button', { name: 'Deactivate' })[0])
    const dialog = screen.getByRole('dialog')
    expect(
      within(dialog).getByText(/won’t see this location any more/i),
    ).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }))
    await waitFor(() => expect(patch).toHaveBeenCalledOnce())
    expect(patch.mock.calls[0]?.[1]).toMatchObject({
      body: { status: 'INACTIVE', version: 0 },
    })
  })

  it('allows delete cancellation, then permanently deletes with a warning', async () => {
    mockReads()
    const remove = vi
      .spyOn(supplierApi, 'DELETE')
      .mockResolvedValue({ response: response(null, 204) } as never)
    const user = userEvent.setup()
    renderRoute('/admin/suppliers')

    await screen.findAllByText('Campus Coffee')
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    expect(
      screen.getByText(/deactivate the supplier instead/i),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(remove).not.toHaveBeenCalled()

    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    await user.click(screen.getByRole('button', { name: 'Permanently delete' }))
    await waitFor(() => expect(remove).toHaveBeenCalledOnce())
    expect(remove.mock.calls[0]?.[1]).toMatchObject({
      params: { path: { id: supplierId }, query: { version: 0 } },
    })
  })

  it('does not retry a stale status change and offers a latest-record reload', async () => {
    mockReads()
    const patch = vi.spyOn(supplierApi, 'PATCH').mockResolvedValue(
      failedResult(
        {
          title: 'Supplier update conflict',
          detail: 'Supplier has changed since the requested version',
          requestedVersion: 0,
          currentVersion: 1,
        },
        409,
      ),
    )
    const user = userEvent.setup()
    renderRoute('/admin/suppliers')

    await screen.findAllByText('Campus Coffee')
    await user.click(screen.getAllByRole('button', { name: 'Deactivate' })[0])
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Deactivate',
      }),
    )

    expect(
      await screen.findByText(/Someone else just changed this location/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(patch).toHaveBeenCalledOnce()
  })

  it('shows list failures with retry and handles empty results', async () => {
    mockReads({ listFailure: true })
    renderRoute('/admin/suppliers')
    expect(
      await screen.findByText('We couldn’t load locations'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument()
  })
})
