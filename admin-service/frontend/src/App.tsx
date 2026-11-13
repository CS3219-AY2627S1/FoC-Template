import { useEffect, useState } from 'react'
import {
  ArrowRight,
  LoaderCircle,
  LockKeyhole,
  MapPinned,
  ShieldCheck,
  ShieldX,
  Users,
  WifiOff,
} from 'lucide-react'
import { AccessError, checkAccess, readSession } from './access'
import { AdminShell } from './components/AdminShell'
import { AdminDashboardOverview, CaseWorkspace } from './CaseWorkspace'

type State = 'loading' | 'signin' | 'denied' | 'unavailable' | 'ready'
const signIn = '/?returnTo=%2Fadmin'

export function App() {
  return window.location.pathname.startsWith('/admin/reports') ||
    window.location.pathname === '/admin/cases' ||
    window.location.pathname.startsWith('/admin/cases/') ? (
    <CaseWorkspace />
  ) : (
    <Dashboard />
  )
}

function Dashboard() {
  const [session, setSession] = useState(readSession)
  const [attempt, setAttempt] = useState(0)
  const [access, setAccess] = useState<{ token?: string; state: State }>({
    state: 'loading',
  })
  useEffect(() => {
    const refresh = () => setSession(readSession())
    const recheck = () => {
      refresh()
      setAttempt((n) => n + 1)
    }
    const timer = window.setInterval(refresh, 15_000)
    window.addEventListener('foc:session-changed', refresh)
    window.addEventListener('foc:session-expired', refresh)
    window.addEventListener('focus', recheck)
    return () => {
      clearInterval(timer)
      window.removeEventListener('foc:session-changed', refresh)
      window.removeEventListener('foc:session-expired', refresh)
      window.removeEventListener('focus', recheck)
    }
  }, [])
  const token = session?.accessToken
  const userId = session?.userId
  useEffect(() => {
    if (!token || !userId) return
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 6000)
    let active = true
    checkAccess({ accessToken: token, userId }, controller.signal)
      .then(() => {
        if (active) setAccess({ token, state: 'ready' })
      })
      .catch((e: unknown) => {
        if (active)
          setAccess({
            token,
            state:
              e instanceof AccessError && e.status === 401
                ? 'signin'
                : e instanceof AccessError && e.status === 403
                  ? 'denied'
                  : 'unavailable',
          })
      })
      .finally(() => clearTimeout(timeout))
    return () => {
      active = false
      controller.abort()
      clearTimeout(timeout)
    }
  }, [token, userId, attempt])
  // A replacement identity never inherits the previous identity's successful check.
  const state: State = !session
    ? 'signin'
    : access.token === token
      ? access.state
      : 'loading'
  useEffect(() => {
    if (state !== 'ready') return
    const timer = window.setTimeout(() => {
      setAttempt((n) => n + 1)
    }, 30_000)
    return () => clearTimeout(timer)
  }, [state, attempt])
  const retry = () => {
    setAccess({ state: 'loading' })
    setAttempt((n) => n + 1)
  }
  return (
    <AdminShell administratorAccess={state === 'ready'}>
      <div className="page-intro admin-dashboard-intro">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Keep campus running smoothly.</h1>
          <p>
            Review community safety, manage access, and keep campus locations
            accurate.
          </p>
        </div>
        {state === 'ready' && (
          <span className="role-chip admin-mode-chip">
            <ShieldCheck aria-hidden="true" />
            Admin mode
          </span>
        )}
      </div>
      {state === 'loading' && (
        <section className="message-card" role="status">
          <span className="message-illustration" aria-hidden="true">
            <LoaderCircle className="spin" />
          </span>
          <h2>Checking your access</h2>
          <p>This only takes a moment.</p>
        </section>
      )}
      {state === 'signin' && (
        <section className="message-card" aria-labelledby="state-title">
          <span className="message-illustration" aria-hidden="true">
            <LockKeyhole />
          </span>

          <h2 id="state-title">Sign in to continue</h2>
          <p>
            Sign in with an admin account, then choose “Switch to Admin” in your
            account menu.
          </p>
          <a className="button" href={signIn}>
            Sign in to FoC
          </a>
        </section>
      )}
      {state === 'denied' && (
        <section className="message-card" aria-labelledby="state-title">
          <span className="message-illustration" aria-hidden="true">
            <ShieldX />
          </span>
          <p className="eyebrow">Access restricted</p>
          <h2 id="state-title">This workspace is for administrators</h2>
          <p>
            You need an active admin account in Admin mode. Choose “Switch to
            Admin” in your account menu if available.
          </p>
          <a className="button" href="/?view=profile">
            Go to your profile
          </a>
        </section>
      )}
      {state === 'unavailable' && (
        <section className="message-card" role="alert">
          <span className="message-illustration" aria-hidden="true">
            <WifiOff />
          </span>
          <p className="eyebrow">Access check unavailable</p>
          <h2>We couldn’t verify your access</h2>
          <p>We couldn’t check your admin access. Please try again.</p>
          <button onClick={retry} type="button">
            Try again
          </button>
          <a className="text-link" href="/?view=profile">
            Return to your profile
          </a>
        </section>
      )}
      {state === 'ready' && (
        <>
          <AdminDashboardOverview key={token} actor={userId!} />
          <section className="admin-tools" aria-labelledby="admin-tools-title">
            <h2 className="visually-hidden" id="admin-tools-title">
              Administration tools
            </h2>
            <nav className="service-grid" aria-label="Administration tools">
              <a className="service-card admin-card" href="/?view=users">
                <span className="admin-tool-icon" aria-hidden="true">
                  <Users />
                </span>
                <div>
                  <h3>Manage users</h3>
                  <p>Manage accounts, admin roles, bans, and reactivation.</p>
                </div>
                <span className="service-action">
                  <span className="visually-hidden">Open user management</span>
                  <ArrowRight aria-hidden="true" />
                </span>
              </a>
              <a className="service-card admin-card" href="/admin/suppliers">
                <span
                  className="admin-tool-icon admin-tool-icon-coral"
                  aria-hidden="true"
                >
                  <MapPinned />
                </span>
                <div>
                  <h3>Campus suppliers</h3>
                  <p>Manage the campus locations used by your community.</p>
                </div>
                <span className="service-action">
                  <span className="visually-hidden">
                    Open supplier management
                  </span>
                  <ArrowRight aria-hidden="true" />
                </span>
              </a>
            </nav>
          </section>
        </>
      )}
    </AdminShell>
  )
}
