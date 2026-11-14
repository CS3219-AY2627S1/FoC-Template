/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component CreateRequest.jsx from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Shows the supplier's faculty where the old location text was shown. No requirements, architecture, schema, or API decisions were made by
 *        the AI tool.
 * Author review: Congchen
 */

import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Bookmark, Minus, Plus } from 'lucide-react'
import Button from '../components/Button'
import SupplierImage from '../components/SupplierImage'
import { suppliers, getSupplier, qualifiedName } from '../data/suppliers'
import { bookmarkedLocations, otherLocations, locations } from '../data/locations'
import { useDemo } from '../context/DemoContext'

const MAX_CHARS = 200
const EXPIRY_CHOICES = [15, 30, 45, 60, 120]

// Defaults follow the clock rather than a hardcoded date that goes stale overnight.
const today = () => new Date().toISOString().slice(0, 10)

// Order F1.1.1 — supplier, description, delivery location, credits offered, expiration,
// additional details. Plus the scheduled-errand and bookmarked-location nice-to-haves.
export default function CreateRequest() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { credits, isLoggedIn, requireLogin } = useDemo()

  // Gated when logged out (§9): the page stays visible behind the scrim.
  useEffect(() => {
    if (!isLoggedIn) requireLogin('You need an account to post an errand.')
  }, [isLoggedIn, requireLogin])

  const [supplierId, setSupplierId] = useState(params.get('supplier') || '')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState(locations[0].name)
  const [postMode, setPostMode] = useState('now')
  const [postDate, setPostDate] = useState(today)
  const [postTime, setPostTime] = useState('11:30')
  const [timing, setTiming] = useState('asap')
  const [expiry, setExpiry] = useState(45)
  const [date, setDate] = useState(today)
  const [time, setTime] = useState('15:30')
  const [offer, setOffer] = useState(4)
  const [extra, setExtra] = useState('')

  const supplier = supplierId ? getSupplier(supplierId) : null

  // An errand that is still collecting couriers past its own delivery deadline is incoherent.
  // Warned about, not blocked - see AI-NOTES for the open question.
  const goesOutAt = (() => {
    if (postMode !== 'schedule') return Date.now()
    const t = new Date(postDate + 'T' + postTime).getTime()
    return Number.isNaN(t) ? Date.now() : t
  })()

  const deadlineTooTight = (() => {
    if (timing !== 'later') return false
    const deadline = new Date(date + 'T' + time)
    if (Number.isNaN(deadline.getTime())) return false
    return deadline.getTime() < goesOutAt + expiry * 60000
  })()
  const insufficient = offer > credits.available
  const remaining = credits.available - offer

  const label = (text, htmlFor) => (
    <label htmlFor={htmlFor} className="block text-base font-semibold text-ink">
      {text}
    </label>
  )

  return (
    <div className="page-gutter mx-auto w-full max-w-[640px] py-8 pb-32 md:py-10 md:pb-10">
      <h1 className="font-display text-2xl font-bold text-ink md:text-3xl">Post an errand</h1>

      <div className="mt-8 space-y-8">
        {/* 1. Pick-up from */}
        <section>
          {label('Pick-up from', 'supplier')}
          {supplier ? (
            <div className="mt-2 flex items-center gap-3 rounded-card border border-line p-3">
              <div className="w-16 shrink-0">
                <SupplierImage supplier={supplier} ratio="aspect-square" rounded="rounded-[10px]" compact />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">
                  {qualifiedName(supplier)}
                </p>
                <p className="truncate text-sm text-ink-40">{supplier.faculty}</p>
              </div>
              <button
                type="button"
                onClick={() => setSupplierId('')}
                className="min-h-[44px] shrink-0 px-2 py-2 text-sm font-medium text-blue hover:underline md:min-h-0"
              >
                Change
              </button>
            </div>
          ) : (
            <select
              id="supplier"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="mt-2 h-12 w-full rounded-btn border border-line bg-surface px-3 text-base text-ink"
            >
              <option value="">Choose a stall</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {qualifiedName(s)}
                </option>
              ))}
            </select>
          )}
        </section>

        {/* 2. What do you need? */}
        <section>
          {label('What do you need?', 'description')}
          <textarea
            id="description"
            rows={4}
            maxLength={MAX_CHARS}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. 1x chicken rice, no cucumber, chilli separate."
            className="mt-2 w-full resize-none rounded-btn border border-line bg-surface p-3 text-base text-ink"
          />
          <div className="mt-1.5 flex items-start justify-between gap-4">
            <p className="max-w-prose text-sm text-ink-40">
              Be specific. Your courier is buying this for you, so mention anything that matters.
            </p>
            <span className="tnum shrink-0 text-sm text-ink-40">
              {description.length}/{MAX_CHARS}
            </span>
          </div>
        </section>

        {/* 3. Deliver to */}
        <section>
          {label('Deliver to', 'location')}
          <select
            id="location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="mt-2 h-12 w-full rounded-btn border border-line bg-surface px-3 text-base text-ink"
          >
            <optgroup label="Saved">
              {bookmarkedLocations.map((l) => (
                <option key={l.id} value={l.name}>
                  {l.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="All locations">
              {otherLocations.map((l) => (
                <option key={l.id} value={l.name}>
                  {l.name}
                </option>
              ))}
            </optgroup>
          </select>
          {bookmarkedLocations.some((l) => l.name === location) && (
            <p className="mt-1.5 flex items-center gap-1.5 text-sm text-ink-40">
              <Bookmark size={13} className="fill-ink-40" aria-hidden="true" />
              Saved location
            </p>
          )}
        </section>

        {/* 4. Post time: optional. When the request is sent out to the board.
        <section>
          <span className="block text-base font-semibold text-ink">
            When should this go out?{' '}
            <span className="font-normal text-ink-40">Optional</span>
          </span>
          <div className="mt-2 inline-flex w-full rounded-btn border border-line p-1">
            {[
              ['now', 'Send it out now'],
              ['schedule', 'Schedule for later'],
            ].map(([value, text]) => (
              <button
                key={value}
                type="button"
                onClick={() => setPostMode(value)}
                aria-pressed={postMode === value}
                className={
                  'h-11 md:h-10 flex-1 rounded-[7px] px-3 text-sm font-medium transition-colors duration-150 ' +
                  (postMode === value ? 'bg-ink text-white' : 'text-ink-70 hover:text-ink')
                }
              >
                {text}
              </button>
            ))}
          </div>
          {postMode === 'schedule' && (
            <div className="foc-fade mt-3 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm text-ink-70">Date</span>
                <input
                  type="date"
                  value={postDate}
                  onChange={(e) => setPostDate(e.target.value)}
                  className="mt-1 h-12 w-full rounded-btn border border-line bg-surface px-3 text-base text-ink"
                />
              </label>
              <label className="block">
                <span className="text-sm text-ink-70">Time</span>
                <input
                  type="time"
                  value={postTime}
                  onChange={(e) => setPostTime(e.target.value)}
                  className="mt-1 h-12 w-full rounded-btn border border-line bg-surface px-3 text-base text-ink"
                />
              </label>
            </div>
          )}
          <p className="mt-1.5 max-w-prose text-sm text-ink-40">
            {postMode === 'schedule'
              ? 'Nobody sees this errand until then. It appears on the board at that time and the countdown below starts from there.'
              : 'Your errand goes on the board as soon as you post it.'}
          </p>
        </section> */}

        {/* 5. Complete-by: the deadline for the food to arrive. */}
        <section>
          <span className="block text-base font-semibold text-ink">
            When do you need it by?
          </span>
          <div className="mt-2 inline-flex w-full rounded-btn border border-line p-1">
            {[
              ['asap', 'As soon as possible'],
              ['later', 'By a specific time'],
            ].map(([value, text]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTiming(value)}
                aria-pressed={timing === value}
                className={
                  'h-11 md:h-10 flex-1 rounded-[7px] px-3 text-sm font-medium transition-colors duration-150 ' +
                  (timing === value ? 'bg-ink text-white' : 'text-ink-70 hover:text-ink')
                }
              >
                {text}
              </button>
            ))}
          </div>
          {timing === 'later' && (
            <div className="foc-fade mt-3 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm text-ink-70">Date</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 h-12 w-full rounded-btn border border-line bg-surface px-3 text-base text-ink"
                />
              </label>
              <label className="block">
                <span className="text-sm text-ink-70">Time</span>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="mt-1 h-12 w-full rounded-btn border border-line bg-surface px-3 text-base text-ink"
                />
              </label>
            </div>
          )}
          <p className="mt-1.5 max-w-prose text-sm text-ink-40">
            This is when the food should reach you. Your courier sees it before accepting.
          </p>
        </section>

        {/* 6. Expiration: how long the request stays on the board unaccepted.
        <section>
          <span className="block text-base font-semibold text-ink">
            How long should this stay open?
          </span>
          <div className="hide-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
            {EXPIRY_CHOICES.map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => setExpiry(mins)}
                aria-pressed={expiry === mins}
                className={
                  'h-11 md:h-10 shrink-0 rounded-pill border px-4 text-sm font-medium transition-colors duration-150 ' +
                  (expiry === mins
                    ? 'border-ink bg-ink text-white'
                    : 'border-line bg-surface text-ink-70 hover:border-ink hover:text-ink')
                }
              >
                {mins < 60 ? mins + ' min' : mins / 60 + (mins === 60 ? ' hour' : ' hours')}
              </button>
            ))}
          </div>
          <p className="mt-1.5 max-w-prose text-sm text-ink-40">
            If nobody accepts it within{' '}
            {expiry < 60 ? expiry + ' minutes' : expiry / 60 + (expiry === 60 ? ' hour' : ' hours')}{' '}
            {postMode === 'schedule' ? 'of it going out' : 'of posting'}, the errand expires and
            your reserved credits come straight back.
          </p>
          {deadlineTooTight && (
            <p className="mt-1.5 max-w-prose text-sm text-alert">
              This errand could still be unaccepted at {time}. Shorten how long it stays open, or
              give a later time to deliver by.
            </p>
          )}
        </section> */}

        {/* 7. Offer */}
        <section>
          <span className="block text-base font-semibold text-ink">Offer</span>
          <div
            className={
              'mt-2 inline-flex h-16 items-center gap-6 rounded-btn border px-4 ' +
              (insufficient ? 'border-alert' : 'border-line')
            }
          >
            <button
              type="button"
              onClick={() => setOffer((v) => Math.max(1, v - 1))}
              disabled={offer <= 1}
              aria-label="Offer one credit fewer"
              className="flex h-11 w-11 items-center justify-center rounded-pill border border-line text-ink disabled:text-ink-40"
            >
              <Minus size={18} aria-hidden="true" />
            </button>
            <span className="tnum min-w-[3ch] text-center text-2xl font-semibold text-ink">
              {offer}
            </span>
            <button
              type="button"
              onClick={() => setOffer((v) => Math.min(10, v + 1))}
              disabled={offer >= 10}
              aria-label="Offer one credit more"
              className="flex h-11 w-11 items-center justify-center rounded-pill border border-line text-ink disabled:text-ink-40"
            >
              <Plus size={18} aria-hidden="true" />
            </button>
          </div>

          {insufficient ? (
            /* Credit F1.2.2 — insufficient credits. */
            <p className="mt-2 max-w-prose text-sm text-alert">
              You have <span className="tnum">{credits.total}</span> credits,{' '}
              <span className="tnum">{credits.reserved}</span> of them reserved. Lower your offer or
              wait for an errand to complete.
            </p>
          ) : (
            <p className="mt-2 text-sm text-ink-40">
              After posting, you&rsquo;ll have <span className="tnum">{remaining}</span> of{' '}
              <span className="tnum">{credits.available}</span> credits available.
            </p>
          )}
        </section>

        {/* 8. Anything else? */}
        <section>
          {label('Anything else?', 'extra')}
          <input
            id="extra"
            type="text"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder="Meet at the side entrance, I'm in a lecture until 3."
            className="mt-2 h-12 w-full rounded-btn border border-line bg-surface px-3 text-base text-ink"
          />
        </section>
      </div>

      {/* Footer bar: sticky to the viewport on mobile. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface p-4 md:static md:mt-10 md:p-0 md:pt-6">
        <div className="page-gutter mx-auto flex max-w-[640px] flex-col gap-3 md:flex-row md:items-center md:justify-between md:px-0">
          <p className="max-w-prose text-sm text-ink-70">
            <span className="tnum">{offer}</span> credits will be reserved until this errand is
            completed or cancelled
            {postMode === 'schedule' && (
              <span className="text-ink-40">
                {' '}
                · scheduled to go out {postDate} at {postTime}
              </span>
            )}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" className="flex-1 md:flex-none" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button
              className="flex-1 md:flex-none"
              disabled={insufficient}
              onClick={() => navigate('/activity')}
            >
              {postMode === 'schedule' ? 'Schedule errand' : 'Post errand'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
