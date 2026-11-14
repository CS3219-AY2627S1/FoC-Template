/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 g (instructions.md) - the "Scheduled" section at the top of My errands:
 *        lists the requester's series (paused included; a one-time series shows until it
 *        posts) with status, rule summary and next 3 dates, and pause/resume/edit/delete
 *        actions, each behind a reminder dialog naming the count of pending+open orders
 *        that stay unaffected (series.activeOrderCount, already computed by order-service -
 *        no extra fetch). The reminder/confirm-dialog shape mirrors AdminUsers.jsx's
 *        ConfirmActionDialog (role="alertdialog", click-outside-to-cancel, busy state).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-10
 * Scope: Stage 32 (instructions.md) - removed the "New" button: recurring/delayed errands are
 *        now created from the normal errand form (/requests/new), not a separate page.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from './Button'
import { useApiNotice } from './ApiNotice'
import { useApi } from '../api/useApi'
import { deleteSeries, editSeries, listMySeries, seriesErrorMessage } from '../api/series'
import { summarizeRuleText } from '../domain/seriesRule'

const STATUS_LABEL = { active: 'Active', inactive: 'Paused' }

function formatDate(iso) {
  return new Date(iso).toLocaleString('en-SG', {
    timeZone: 'Asia/Singapore',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const DIALOG = {
  pause: {
    title: 'Pause this recurring errand?',
    confirmLabel: 'Pause',
    variant: 'secondary',
    run: (id) => editSeries(id, { status: 'inactive' }),
  },
  resume: {
    title: 'Resume this recurring errand?',
    confirmLabel: 'Resume',
    variant: 'primary',
    run: (id) => editSeries(id, { status: 'active' }),
  },
  delete: {
    title: 'Delete this recurring errand?',
    confirmLabel: 'Delete',
    variant: 'danger',
    run: (id) => deleteSeries(id),
  },
}

function ConfirmSeriesDialog({ series, action, onCancel, onDone }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const spec = DIALOG[action]
  const count = series.activeOrderCount ?? 0

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      await spec.run(series.id)
      onDone()
    } catch (e) {
      setError(seriesErrorMessage(e))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button type="button" aria-label="Cancel" className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div
        role="alertdialog"
        aria-labelledby="confirm-series-title"
        className="foc-fade relative w-full max-w-md rounded-t-card bg-surface p-5 shadow-modal sm:rounded-card"
      >
        <h2 id="confirm-series-title" className="text-lg font-semibold text-ink">
          {spec.title}
        </h2>
        <p className="mt-2 text-sm text-ink-70">
          {count > 0
            ? count + (count === 1 ? ' errand' : ' errands') + " already posted from it (pending or open) won't be affected."
            : 'No errands have been posted from it yet.'}
        </p>
        {error && (
          <p role="alert" className="mt-2 text-sm text-alert">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={spec.variant} onClick={confirm} disabled={busy}>
            {busy ? 'Working…' : spec.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

function SeriesCard({ series, onRequestAction, onEdit }) {
  const paused = series.status === 'inactive'
  return (
    <article className={'card border-l-[3px] border-l-blue p-4 ' + (paused ? 'opacity-70' : '')}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={
            'inline-flex h-6 items-center rounded-pill px-2.5 text-xs font-medium ' +
            (paused ? 'bg-surface-alt text-ink-40' : 'bg-surface border border-blue text-blue')
          }
        >
          {STATUS_LABEL[series.status] ?? series.status}
        </span>
        <h3 className="text-sm font-semibold text-ink">{series.description}</h3>
      </div>
      <p className="mt-1.5 text-sm text-ink-70">{summarizeRuleText(series.rrule, new Date(series.startAt))}</p>
      {series.upcomingDates.length > 0 ? (
        <p className="mt-1 text-sm text-ink-40">Next: {series.upcomingDates.map(formatDate).join(', ')}</p>
      ) : (
        <p className="mt-1 text-sm text-ink-40">No more occurrences scheduled.</p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={onEdit}>
          Edit
        </Button>
        {paused ? (
          <Button variant="secondary" size="sm" onClick={() => onRequestAction('resume')}>
            Resume
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => onRequestAction('pause')}>
            Pause
          </Button>
        )}
        <Button variant="danger" size="sm" onClick={() => onRequestAction('delete')}>
          Delete
        </Button>
      </div>
    </article>
  )
}

export default function ScheduledSeriesSection() {
  const navigate = useNavigate()
  const { data, loading, error, reload } = useApi(() => listMySeries(), [])
  const [confirm, setConfirm] = useState(null) // { series, action }
  const notice = useApiNotice({ loading, error }, 'your scheduled errands')
  const list = data?.series ?? []

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-40">Scheduled</h2>
      </div>

      {notice}

      {!notice && list.length === 0 && (
        <p className="mt-3 text-sm text-ink-40">
          No recurring errands yet. Set one up to have it post on a schedule.
        </p>
      )}

      {!notice && list.length > 0 && (
        <div className="mt-3 space-y-4">
          {list.map((series) => (
            <SeriesCard
              key={series.id}
              series={series}
              onEdit={() => navigate('/series/' + series.id + '/edit')}
              onRequestAction={(action) => setConfirm({ series, action })}
            />
          ))}
        </div>
      )}

      {confirm && (
        <ConfirmSeriesDialog
          series={confirm.series}
          action={confirm.action}
          onCancel={() => setConfirm(null)}
          onDone={() => {
            setConfirm(null)
            reload()
          }}
        />
      )}
    </section>
  )
}
