/* AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-11-09.
 * Scope: Authenticated, filtered Credit history UI for #65. Author review: Reviewed and approved by @phuc. */
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { listCreditTransactions } from '../api/creditApi'
import { ApiError, NetworkError } from '../api/client'
import { Pagination } from '../components/Pagination'
import { TopBar } from '../components/TopBar'
import { dateRangeError, historyFilters, PAGE_SIZES, transactionQuery } from './historyFilters'
import type { CreditTransaction, CreditTransactionPage, CreditTransactionType } from './types'

const LABELS: Record<CreditTransactionType, string> = {
  INITIAL_GRANT: 'Welcome credits', RESERVE: 'Credits reserved', CAPTURE_DEBIT: 'Errand payment',
  CAPTURE_CREDIT: 'Errand earnings', RELEASE: 'Credits released', FORFEIT: 'Credits forfeited',
}
const dateFormat = new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Singapore' })
const amountFormat = new Intl.NumberFormat('en-SG')
const button = 'min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-navy-800 hover:bg-navy-50 disabled:opacity-50'

export function CreditTransactionsPage() {
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => historyFilters(params), [params])
  const invalidRange = dateRangeError(filters.from, filters.to)
  const [retry, setRetry] = useState(0)
  const key = `${params.toString()}:${retry}`
  const [state, setState] = useState<{ key: string; data: CreditTransactionPage | null; error: unknown }>({ key: '', data: null, error: null })
  const loading = !invalidRange && key !== state.key
  const data = loading || invalidRange ? null : state.data
  const error = loading || invalidRange ? null : state.error

  useEffect(() => {
    if (invalidRange) return
    const controller = new AbortController()
    let current = true
    listCreditTransactions(transactionQuery(filters), controller.signal).then(
      (data) => { if (current) setState({ key, data, error: null }) },
      (error: unknown) => { if (current && !controller.signal.aborted) setState({ key, data: null, error }) },
    )
    return () => { current = false; controller.abort() }
  }, [filters, invalidRange, key])

  function changePage(page: number) {
    const next = new URLSearchParams(params)
    if (page === 0) next.delete('page')
    else next.set('page', String(page))
    setParams(next)
  }

  return <>
    <TopBar creditRefreshKey={retry} />
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent-600">My credits</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-navy-900 sm:text-4xl">Credit transactions</h1>
        <button type="button" className={button} disabled={loading || !!invalidRange} onClick={() => setRetry((value) => value + 1)}>Refresh</button>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">Your credit activity, newest first. Available credits can be used for errands; reserved credits are held for ongoing errands.</p>
      <HistoryFilters key={`${filters.from}:${filters.to}:${filters.size}`} filters={filters} onApply={(from, to, size) => {
        const next = new URLSearchParams()
        if (from) next.set('from', from)
        if (to) next.set('to', to)
        if (size !== 20) next.set('size', String(size))
        setParams(next)
      }} onClear={() => setParams(new URLSearchParams())} />

      <section className="mt-6" aria-label="Credit transaction history" aria-busy={loading}>
        {invalidRange && <p role="alert" className="rounded-xl border border-red-200 bg-white p-5 text-red-700">{invalidRange} Update or clear your filters.</p>}
        {loading && <p role="status" className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-600">Loading transactions…</p>}
        {error !== null && <div role="alert" className="rounded-2xl border border-red-200 bg-white p-6">
          <h2 className="text-lg font-bold text-navy-900">Couldn’t load transactions</h2>
          <p className="mt-2 text-sm text-slate-600">{errorMessage(error)}</p>
          <button type="button" className={`${button} mt-4`} onClick={() => setRetry((value) => value + 1)}>Try again</button>
        </div>}
        {data && <>
          <p className="mb-4 text-sm text-slate-500" aria-live="polite">{amountFormat.format(data.totalItems)} {data.totalItems === 1 ? 'transaction' : 'transactions'} · Times shown in Singapore time</p>
          {data.items.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <h2 className="text-lg font-bold text-navy-900">{data.totalItems > 0 ? 'No transactions on this page' : filters.from || filters.to ? 'No transactions match these dates' : 'No transactions yet'}</h2>
            <p className="mt-2 text-sm text-slate-600">{data.totalItems > 0 ? 'Return to the first page to see your transactions.' : 'Your credit activity will appear here. Try a wider date range or refresh later.'}</p>
            <button type="button" className={`${button} mt-4`} onClick={() => data.totalItems > 0 ? changePage(0) : setParams(new URLSearchParams())}>{data.totalItems > 0 ? 'First page' : 'Clear filters'}</button>
          </div> : <ul className="space-y-4">{data.items.map((item) => <TransactionCard key={item.id} item={item} />)}</ul>}
          {data.totalItems > 0 && <div className="mt-5"><Pagination page={data.page} totalPages={Math.ceil(data.totalItems / data.size)} totalItems={data.totalItems} noun="transactions" label="Transaction pages" onPageChange={changePage} /></div>}
        </>}
      </section>
    </main>
  </>
}

function HistoryFilters({ filters, onApply, onClear }: {
  filters: ReturnType<typeof historyFilters>
  onApply: (from: string, to: string, size: number) => void
  onClear: () => void
}) {
  const [from, setFrom] = useState(filters.from)
  const [to, setTo] = useState(filters.to)
  const [size, setSize] = useState(filters.size)
  const [error, setError] = useState<string | null>(null)
  function submit(event: FormEvent) {
    event.preventDefault()
    const error = dateRangeError(from, to)
    setError(error)
    if (!error) onApply(from, to, size)
  }
  const input = 'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-navy-900'
  return <form noValidate onSubmit={submit} aria-label="Filter transactions" className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
    <div className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
      <label className="min-w-0 text-sm font-medium text-navy-900">From date<input type="date" min="0001-01-01" max="9999-12-31" value={from} onChange={(event) => setFrom(event.target.value)} className={input} aria-describedby="credit-date-hint credit-filter-error" aria-invalid={!!error} /></label>
      <label className="min-w-0 text-sm font-medium text-navy-900">To date<input type="date" min="0001-01-01" max="9999-12-30" value={to} onChange={(event) => setTo(event.target.value)} className={input} aria-describedby="credit-date-hint credit-filter-error" aria-invalid={!!error} /></label>
      <label className="min-w-0 text-sm font-medium text-navy-900">Per page<select value={size} onChange={(event) => setSize(Number(event.target.value) as typeof size)} className={input}>{PAGE_SIZES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <div className="flex gap-2"><button type="submit" className="min-h-11 rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">Apply filters</button><button type="button" className={button} onClick={() => { setFrom(''); setTo(''); setSize(20); setError(null); onClear() }}>Clear filters</button></div>
    </div>
    <p id="credit-date-hint" className="mt-3 text-xs text-slate-500">Both dates are inclusive and use Singapore time (UTC+08:00). Leave either date blank for an open range.</p>
    <p id="credit-filter-error" role={error ? 'alert' : undefined} className="mt-2 text-sm text-red-700">{error}</p>
  </form>
}

function TransactionCard({ item }: { item: CreditTransaction }) {
  return <li className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="font-bold text-navy-900">{LABELS[item.type] ?? item.type}</h2><time dateTime={item.createdAt} className="mt-1 block text-sm text-slate-500">{dateFormat.format(new Date(item.createdAt))}</time></div>
      <dl className="grid grid-cols-2 gap-6 text-right"><Delta label="Available change" value={item.availableDelta} /><Delta label="Reserved change" value={item.reservedDelta} /></dl>
    </div>
    <dl className="mt-4 grid gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
      <div><dt className="inline font-medium">Transaction: </dt><dd className="inline break-all">{item.id}</dd></div>
      {item.orderId && <div><dt className="inline font-medium">Errand: </dt><dd className="inline break-all">{item.orderId}</dd></div>}
      {item.reservationId && <div><dt className="inline font-medium">Reservation: </dt><dd className="inline break-all">{item.reservationId}</dd></div>}
    </dl>
  </li>
}

function Delta({ label, value }: { label: string; value: number }) {
  return <div><dt className="text-xs text-slate-500">{label}</dt><dd className={`mt-1 text-lg font-bold tabular-nums ${value > 0 ? 'text-emerald-700' : value < 0 ? 'text-red-700' : 'text-slate-500'}`}>{value > 0 ? '+' : ''}{amountFormat.format(value)}</dd></div>
}

function errorMessage(error: unknown): string {
  if (error instanceof NetworkError) return error.message
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Your session has expired. Please sign in again.'
    if (error.status === 503) return 'Transaction history is temporarily unavailable. Please try again shortly.'
    if (error.status === 400) return 'The selected filters could not be applied. Update or clear your date range.'
  }
  return 'Something went wrong while loading your history. Please try again.'
}
