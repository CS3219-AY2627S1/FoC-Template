/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27
 * Scope: Added focused protected Supplier route tests for issue #29.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), 2026-11-09. Scope: tests
 * for the errand routes. Author review: Reviewed and approved by @mattis.
 */
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import { AuthContext, type AuthApi } from './auth/authContext'

vi.mock('./suppliers/SupplierListPage', () => ({
  SupplierListPage: () => <h1>Supplier catalogue route</h1>,
}))
vi.mock('./suppliers/SupplierDetailPage', () => ({
  SupplierDetailPage: () => <h1>Supplier detail route</h1>,
}))

vi.mock('./errands/OpenErrandsPage', () => ({ OpenErrandsPage: () => <h1>Open errands route</h1> }))
vi.mock('./errands/MyErrandsPage', () => ({ MyErrandsPage: () => <h1>My errands route</h1> }))
vi.mock('./errands/CreateErrandPage', () => ({ CreateErrandPage: () => <h1>Create errand route</h1> }))
vi.mock('./errands/ErrandDetailPage', () => ({ ErrandDetailPage: () => <h1>Errand detail route</h1> }))

const loggedIn: AuthApi = {
  status: 'loggedIn',
  user: { username: 'member_one', displayName: 'Member One', role: 'MEMBER' },
  notice: null,
  login: vi.fn(),
  logout: vi.fn(),
}

describe('Supplier routes', () => {
  it('redirects the authenticated root route to the Supplier catalogue', async () => {
    renderApp('/', loggedIn)
    expect(await screen.findByRole('heading', { name: 'Supplier catalogue route' })).toBeInTheDocument()
  })

  it('protects Supplier detail from logged-out visitors', async () => {
    renderApp('/suppliers/supplier-id', { ...loggedIn, status: 'loggedOut', user: null })
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Supplier detail route' })).not.toBeInTheDocument()
  })

  it.each([
    ['/errands', 'Open errands route'],
    ['/errands/mine', 'My errands route'],
    ['/errands/new', 'Create errand route'],
    ['/errands/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Errand detail route'],
  ])('routes %s to its errand page', async (path, heading) => {
    renderApp(path, loggedIn)
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
  })

  it('protects errand pages from logged-out visitors', async () => {
    renderApp('/errands/mine', { ...loggedIn, status: 'loggedOut', user: null })
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })
})

function renderApp(path: string, auth: AuthApi) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthContext.Provider value={auth}>
        <App />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}
