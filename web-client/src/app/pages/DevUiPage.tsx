import { useState } from 'react'
import { useSession } from '@/api/user/session'
import { Page } from '@/components/Page'
import { ApiError, fieldErrorsOf, request } from '@/lib/http'
import { LoadingState } from '@/components/LoadingState'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { FormError } from '@/components/FormError'
import { Notice } from '@/components/Notice'
import { QueryView } from '@/components/QueryView'
import { TextField } from '@/components/TextField'
import { SelectField } from '@/components/SelectField'
import { TextAreaField } from '@/components/TextAreaField'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { SubmitEvent } from 'react'
import { SubmitButton } from '@/components/SubmitButton'
import { Pagination } from '@/components/Pagination'
import { formatDate, formatDateTime, formatTime } from '@/lib/format'

// Hand-made errors, so every error view can be seen without breaking a service.
const offlineError = new ApiError(0, 'NETWORK_ERROR', 'Could not reach Relay. Check your connection and try again.')
const forbiddenError = new ApiError(403, 'FORBIDDEN', 'You are not allowed to do this')
const validationError = new ApiError(400, 'VALIDATION_FAILED', 'One or more fields are invalid', {
  email: ['must end with @u.nus.edu or @nus.edu.sg'],
  body: ['must contain fullName or username'],
})


const statusBadges = [
  { label: 'Open', className: 'ds-badge ds-badge--danger' },
  { label: 'Accepted', className: 'ds-badge ds-badge--info' },
  { label: 'Completed', className: 'ds-badge ds-badge--success' },
  { label: 'Cancelled', className: 'ds-badge ds-badge--neutral' },
]

export function DevUiPage() {
  return (
    <main id="main">
      <Page
        title="Relay UI gallery"
        subtitle="Every shared component in every state. Left out of production builds."
        actions={<span className="ds-badge ds-badge--neutral">Dev only</span>}
      >
        <section className="ds-surface grid grid-cols-1 gap-4 p-5">
          <h2>Buttons</h2>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="ds-btn ds-btn--primary">
              Primary
            </button>
            <button type="button" className="ds-btn ds-btn--glass">
              Glass
            </button>
            <button type="button" className="ds-btn ds-btn--text">
              Text
            </button>
            <button type="button" className="ds-btn ds-btn--primary" disabled>
              Disabled
            </button>
          </div>
        </section>

        <section className="ds-surface grid grid-cols-1 gap-4 p-5">
          <h2>Long content (N5.1)</h2>
          <p className="text-muted">Nothing here may push the page wider than the screen.</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="ds-btn ds-btn--primary">
              A very long button label that has to wrap on a small phone
            </button>
          </div>
          <p>e0123456789.with.a.very.long.name.that.does.not.fit@u.nus.edu</p>
          <div className="ds-segmented">
            <button type="button" aria-pressed="true">All</button>
            <button type="button">Stores</button>
            <button type="button">Facilities</button>
            <button type="button">Landmarks</button>
            <button type="button">Printers</button>
          </div>
        </section>


        <section className="ds-surface grid grid-cols-1 gap-4 p-5">
          <h2>Status badges</h2>
          <div className="flex flex-wrap gap-3">
            {statusBadges.map((badge) => (
              <span key={badge.label} className={badge.className}>
                {badge.label}
              </span>
            ))}
          </div>
        </section>

        <SessionDemo />

        <section className="grid grid-cols-1 gap-4">
          <h2>Loading state</h2>
          <LoadingState label="Loading suppliers" />
          <LoadingState label="Loading errands" rows={5} />
        </section>

        <QueryViewDemo />

        <PaginationDemo />

        <FormatDemo />

        <EmptyStateDemo />

        <section className="grid grid-cols-1 gap-4">
          <h2>Notices</h2>
          <Notice tone="info" title="Code sent">
            We sent a new 6-digit code to e0123456@u.nus.edu.
          </Notice>
          <Notice tone="success" title="Starter credits: 50 CR">
            Granted once. Credits stay inside Relay and cannot be bought or cashed out.
          </Notice>
          <Notice tone="danger" title="This account is suspended" />
        </section>

        <section className="grid grid-cols-1 gap-4">
          <h2>Error state</h2>
          <ErrorState error={offlineError} onRetry={() => alert('Retry clicked')} />
          <ErrorState error={forbiddenError} onRetry={() => alert('Retry clicked')} />
        </section>

        <section className="grid grid-cols-1 gap-4">
          <h2>Form error</h2>
          <FormError error={validationError} fields={['email']} />
        </section>

        <ErrorCases />

        <TextFieldDemo />

        <SelectFieldDemo />

        <TextAreaFieldDemo />

        <FormDemo />
      </Page>
    </main>
  )
}

function SessionDemo() {
  const session = useSession()
  // Needs a session. Logged out, it answers 401, and the global handler turns the session to guest.
  const protectedData = useQuery({
    queryKey: ['gallery', 'protected'],
    queryFn: () => request('supplier', '/suppliers', { query: { pageSize: 1 } }),
    enabled: false,
    retry: false,
  })

  let status: string
  if (session.isPending) status = 'Loading…'
  else if (session.isError) status = `Error: ${session.error.message}`
  else if (session.data === null) status = 'Guest (not logged in)'
  else status = `Logged in as ${session.data.username} (${session.data.roles.join(', ')})`

  return (
    <section className="ds-surface grid grid-cols-1 gap-4 p-5">
      <h2>Session (useSession)</h2>
      <p className="text-muted">Asks GET /api/user/users/me once and keeps the answer in the cache.</p>
      <p>
        <strong>{status}</strong>
      </p>
      <div>
        <button
          type="button"
          className="ds-btn ds-btn--glass"
          onClick={() => session.refetch()}
          disabled={session.isFetching}
        >
          {session.isFetching ? 'Fetching…' : 'Refetch'}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="ds-btn ds-btn--glass" onClick={() => protectedData.refetch()}>
          Load protected data
        </button>
        <span className="text-muted">
          {protectedData.isError ? `Refused: ${protectedData.error.message}` : protectedData.isSuccess ? 'Loaded' : ''}
        </span>
      </div>
    </section>
  )
}

const errorCases = [
  {
    label: 'Invalid sign-up',
    run: () =>
      request('user', '/auth/register', {
        method: 'POST',
        body: { fullName: 'Gallery Demo', email: 'demo@gmail.com', username: 'gallery-demo', password: 'short' },
      }),
  },
  {
    label: 'Unknown API route',
    run: () => request('user', '/does-not-exist'),
  },
  {
    label: 'Invalid supplier (log in as admin first)',
    run: () => request('supplier', '/suppliers', { method: 'POST', body: { name: '' } }),
  },
]

function ErrorCases() {
  const [result, setResult] = useState('Pick a case')

  async function show(run: () => Promise<unknown>) {
    try {
      await run()
      setResult('No error')
    } catch (error) {
      if (error instanceof ApiError) {
        const { status, code, message, fieldErrors } = error
        setResult(JSON.stringify({ status, code, message, fieldErrors }, null, 2))
      } else {
        setResult(String(error))
      }
    }
  }

  return (
    <section className="ds-surface grid grid-cols-1 gap-4 p-5">
      <h2>Error handling (ApiError)</h2>
      <p className="text-muted">Each button triggers a refused request. Nothing is created.</p>
      <div className="flex flex-wrap gap-3">
        {errorCases.map((errorCase) => (
          <button
            key={errorCase.label}
            type="button"
            className="ds-btn ds-btn--glass"
            onClick={() => show(errorCase.run)}
          >
            {errorCase.label}
          </button>
        ))}
      </div>
      <pre className="ds-surface ds-surface--sunken p-3 font-mono text-sm whitespace-pre-wrap wrap-anywhere">
        {result}
      </pre>
    </section>
  )
}

type DemoFilter = 'All' | 'Open' | 'Completed'

const demoFilters: DemoFilter[] = ['All', 'Open', 'Completed']

const demoErrands = [
  { id: 'ER-2390', title: 'Fine Food @ UTown', state: 'Open' },
  { id: 'ER-2377', title: 'Printers @ PC Commons', state: 'Open' },
]

function EmptyStateDemo() {
  const [filter, setFilter] = useState<DemoFilter>('Completed')
  const visible = filter === 'All' ? demoErrands : demoErrands.filter((errand) => errand.state === filter)

  return (
    <section className="grid grid-cols-1 gap-4">
      <h2>Empty state</h2>
      <div className="ds-segmented justify-self-start">
        {demoFilters.map((option) => (
          <button key={option} type="button" aria-pressed={filter === option} onClick={() => setFilter(option)}>
            {option}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <EmptyState
          title={`No ${filter.toLowerCase()} errands`}
          description="Errands show up here once they reach this state."
          action={
            <button type="button" className="ds-btn ds-btn--glass" onClick={() => setFilter('All')}>
              Show all errands
            </button>
          }
        />
      ) : (
        <ul className="ds-surface ds-rows">
          {visible.map((errand) => (
            <li key={errand.id} className="flex items-center justify-between gap-3 p-4">
              <span className="min-w-0">{errand.title}</span>
              <span className="ds-badge ds-badge--danger">{errand.state}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

type DemoMode = 'data' | 'empty' | 'error'

const demoModes: DemoMode[] = ['data', 'empty', 'error']

// Pretends to be a service: answers after a second with data, nothing, or a 503.
async function loadDemoSuppliers(mode: DemoMode): Promise<string[]> {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  if (mode === 'error') {
    throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'This part of Relay is not reachable right now.')
  }
  return mode === 'empty' ? [] : ['CoffeeBean @ COM3', 'Fine Food @ UTown', 'Printers @ PC Commons']
}

function QueryViewDemo() {
  const [mode, setMode] = useState<DemoMode>('data')
  const suppliers = useQuery({
    // A gallery-only key. Real keys start with the service name, e.g. ['supplier', 'list'].
    queryKey: ['gallery', 'suppliers', mode],
    queryFn: () => loadDemoSuppliers(mode),
    retry: false,
  })

  return (
    <section className="grid grid-cols-1 gap-4">
      <h2>Query view</h2>
      <div className="ds-segmented justify-self-start">
        {demoModes.map((option) => (
          <button key={option} type="button" aria-pressed={mode === option} onClick={() => setMode(option)}>
            {option}
          </button>
        ))}
      </div>
      <QueryView
        query={suppliers}
        loadingLabel="Loading suppliers"
        isEmpty={(list) => list.length === 0}
        empty={
          <EmptyState
            title="No suppliers found"
            description="Nothing matches this filter."
            action={
              <button type="button" className="ds-btn ds-btn--glass" onClick={() => setMode('data')}>
                Show all suppliers
              </button>
            }
          />
        }
      >
        {(list) => (
          <ul className="ds-surface ds-rows">
            {list.map((name) => (
              <li key={name} className="p-4">
                {name}
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </section>
  )
}

function TextFieldDemo() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('demo@gmail.com')

  return (
    <section className="ds-surface grid grid-cols-1 gap-4 p-5">
      <h2>Text field</h2>
      <TextField
        label="Full name"
        name="fullName"
        autoComplete="name"
        value={fullName}
        onChange={setFullName}
        hint="As it should appear to other students."
      />
      <p className="text-muted">Typed so far: {fullName || '(nothing)'}</p>
      <TextField
        label="NUS email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={setEmail}
        errors={validationError.fieldErrors.email}
      />
    </section>
  )
}

const zoneOptions = [
  { value: '', label: 'All zones' },
  { value: 'Central', label: 'Central' },
  { value: 'UTown', label: 'UTown' },
  { value: 'Kent Ridge', label: 'Kent Ridge' },
]

function SelectFieldDemo() {
  const [zone, setZone] = useState('')

  return (
    <section className="ds-surface grid grid-cols-1 gap-4 p-5">
      <h2>Select field</h2>
      <SelectField label="Campus zone" name="zone" value={zone} onChange={setZone} options={zoneOptions} />
      <p className="text-muted">Selected: {zone || '(all zones)'}</p>
      <SelectField
        label="Type"
        name="type"
        value=""
        onChange={() => {}}
        options={[{ value: '', label: 'Pick a type' }]}
        errors={['is required']}
      />
    </section>
  )
}

function TextAreaFieldDemo() {
  const [reason, setReason] = useState('')

  return (
    <section className="ds-surface grid grid-cols-1 gap-4 p-5">
      <h2>Text area field</h2>
      <TextAreaField
        label="Reason"
        name="reason"
        value={reason}
        onChange={setReason}
        hint="Between 20 and 500 characters"
        characterLimit={500}
      />
      <TextAreaField
        label="Justification"
        name="justification"
        value="Too short"
        onChange={() => {}}
        rows={2}
        characterLimit={500}
        errors={['must be between 20 and 500 characters']}
      />
    </section>
  )
}

type DemoSignUp = {
  fullName: string
  email: string
  username: string
  password: string
}

function FormDemo() {
  const [values, setValues] = useState<DemoSignUp>({
    fullName: 'Gallery Demo',
    email: 'demo@gmail.com',
    username: 'gallery-demo',
    password: 'short',
  })
  // Inline only in the gallery. Real pages take their mutations from src/api/<service>/.
  const signUp = useMutation({
    mutationFn: (input: DemoSignUp) => request('user', '/auth/register', { method: 'POST', body: input }),
  })
  const fieldErrors = fieldErrorsOf(signUp.error)

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    signUp.mutate(values)
  }

  return (
    <section className="ds-surface grid grid-cols-1 gap-4 p-5">
      <h2>Form (real request)</h2>
      <p className="text-muted">
        Sends a sign-up to the user-service. With these values it is refused and nothing is created.
      </p>
      <form noValidate onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
        <FormError error={signUp.error} fields={['fullName', 'email', 'username', 'password']} />
        <TextField
          label="Full name"
          name="fullName"
          autoComplete="name"
          value={values.fullName}
          onChange={(fullName) => setValues({ ...values, fullName })}
          errors={fieldErrors.fullName}
        />
        <TextField
          label="NUS email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={values.email}
          onChange={(email) => setValues({ ...values, email })}
          errors={fieldErrors.email}
        />
        <TextField
          label="Username"
          name="username"
          autoComplete="username"
          value={values.username}
          onChange={(username) => setValues({ ...values, username })}
          errors={fieldErrors.username}
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={values.password}
          onChange={(password) => setValues({ ...values, password })}
          errors={fieldErrors.password}
        />
        <SubmitButton pending={signUp.isPending} pendingLabel="Creating account…">
          Create account
        </SubmitButton>
      </form>
    </section>
  )
}

function PaginationDemo() {
  const [page, setPage] = useState(1)
  const pageSize = 20
  const total = 95
  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  return (
    <section className="ds-surface grid grid-cols-1 gap-4 p-5">
      <h2>Pagination</h2>
      <p className="text-muted">
        Showing {first} to {last} of {total} suppliers
      </p>
      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
    </section>
  )
}

const sampleTime = '2026-08-12T10:22:00.000Z'

function FormatDemo() {
  return (
    <section className="ds-surface grid grid-cols-1 gap-2 p-5">
      <h2>Dates and times (campus time)</h2>
      <p>formatDate: {formatDate(sampleTime)}</p>
      <p>formatTime: {formatTime(sampleTime)}</p>
      <p>formatDateTime: {formatDateTime(sampleTime)}</p>
    </section>
  )
}