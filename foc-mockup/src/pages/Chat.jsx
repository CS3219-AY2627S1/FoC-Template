/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component Chat.jsx from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 */

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Languages, Paperclip, Phone, Send, Video } from 'lucide-react'
import { threads, LANG_NAMES, SYSTEM_USER, threadHref, findThread } from '../data/messages'
import { getUser, firstName } from '../data/users'
import { getSupplier, qualifiedName } from '../data/suppliers'
import { useDemo } from '../context/DemoContext'

// Nice-to-have: real-time chat and translation. Translations are hardcoded in messages.js.
export default function Chat() {
  const { id } = useParams()
  const { currentUser, requests, isLoggedIn, requireLogin } = useDemo()

  // Gated when logged out (§9): the page stays visible behind the scrim.
  useEffect(() => {
    if (!isLoggedIn) requireLogin('You need an account to open this chat.')
  }, [isLoggedIn, requireLogin])
  const [autoTranslate, setAutoTranslate] = useState(false)
  const [translated, setTranslated] = useState({})

  const thread = findThread(id) || threads[0]
  const isSystem = thread.withUserId === 'system'
  const request = thread.requestId ? requests.find((r) => r.id === thread.requestId) : null
  const supplier = request ? getSupplier(request.supplierId) : null
  const other = isSystem ? SYSTEM_USER : getUser(thread.withUserId)

  const isTranslated = (m) => autoTranslate || translated[m.id]

  return (
    <div className="page-width page-gutter py-0 md:py-6">
      <div className="flex h-[calc(100vh-4rem)] gap-6 md:h-[calc(100vh-8rem)]">
        {/* Conversation list */}
        <aside className="hidden w-[320px] shrink-0 flex-col overflow-hidden rounded-card border border-line md:flex">
          <h1 className="border-b border-line px-4 py-4 text-base font-semibold text-ink">
            Messages
          </h1>
          <ul className="flex-1 overflow-y-auto">
            {threads.map((t) => {
              const person = t.withUserId === 'system' ? SYSTEM_USER : getUser(t.withUserId)
              const active = t.id === thread.id
              const last = t.messages[t.messages.length - 1]
              return (
                <li key={t.id}>
                  <Link
                    to={threadHref(t)}
                    className={
                      'flex gap-3 border-b border-line px-4 py-3 ' +
                      (active ? 'bg-surface-alt' : 'hover:bg-surface-alt')
                    }
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-surface-alt text-xs font-semibold text-ink">
                      {person.initials}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium text-ink">{person.name}</span>
                        <span className="tnum shrink-0 text-xs text-ink-40">{t.lastAt}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-ink-40">{last.text}</span>
                    </span>
                    {t.unread > 0 && (
                      <span className="tnum mt-1 flex h-5 min-w-[20px] items-center justify-center rounded-pill bg-ink px-1.5 text-[11px] font-semibold text-white">
                        {t.unread}
                      </span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </aside>

        {/* Thread */}
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden md:rounded-card md:border md:border-line">
          <header className="flex items-center gap-3 border-b border-line px-1 py-3 md:px-4">
            <Link
              to="/activity"
              aria-label="Back to activity"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-btn text-ink md:hidden"
            >
              <ArrowLeft size={20} aria-hidden="true" />
            </Link>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-surface-alt text-xs font-semibold text-ink">
              {other.initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{other.name}</p>
              <p className="truncate text-xs text-ink-40">
                {isSystem ? (
                  'Account updates'
                ) : (
                  <>
                    {qualifiedName(supplier)} <span aria-hidden="true">&rarr;</span>{' '}
                    {request.deliveryLocation} ·{' '}
                    <span className="tnum">{request.credits}</span> cr
                  </>
                )}
              </p>
            </div>
            {!isSystem && (
              <>
                <button
                  type="button"
                  aria-label="Voice call"
                  className="flex h-11 w-11 items-center justify-center rounded-btn text-ink-70 hover:bg-surface-alt"
                >
                  <Phone size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Video call"
                  className="flex h-11 w-11 items-center justify-center rounded-btn text-ink-70 hover:bg-surface-alt"
                >
                  <Video size={18} aria-hidden="true" />
                </button>
              </>
            )}
          </header>

          {!isSystem && (
            <div className="flex items-center justify-end gap-2 border-b border-line px-3 py-2 md:px-4">
            <span id="auto-translate-label" className="text-xs text-ink-70">
              Auto-translate
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={autoTranslate}
              aria-labelledby="auto-translate-label"
              onClick={() => setAutoTranslate((v) => !v)}
              /* The button carries the 44px tap target; the track inside stays 24px tall. */
              className="flex h-11 w-11 shrink-0 items-center justify-center md:h-6 md:w-10"
            >
              <span
                className={
                  'relative block h-6 w-10 rounded-pill transition-colors duration-150 ' +
                  (autoTranslate ? 'bg-blue' : 'bg-line')
                }
                aria-hidden="true"
              >
                <span
                  className={
                    'absolute top-0.5 h-5 w-5 rounded-pill bg-surface transition-all duration-150 ' +
                    (autoTranslate ? 'left-[18px]' : 'left-0.5')
                  }
                />
              </span>
            </button>
          </div>
          )}

          <ol className="flex-1 space-y-4 overflow-y-auto px-3 py-4 md:px-4">
            {thread.messages.map((m) => {
              if (m.from === 'system') {
                return (
                  <li key={m.id} className="flex flex-col items-center">
                    <div className="max-w-prose rounded-card border border-line bg-surface-alt px-4 py-3 text-center text-sm text-ink-70">
                      {m.text}
                    </div>
                    <p className="tnum mt-1 text-xs text-ink-40">{m.at}</p>
                  </li>
                )
              }
              const own = m.from === currentUser.id
              const translatable = m.lang !== 'en' && m.translation
              const showing = translatable && isTranslated(m)
              return (
                <li key={m.id} className={'flex flex-col ' + (own ? 'items-end' : 'items-start')}>
                  <div className="max-w-[70%]">
                    {showing && (
                      <p className="mb-1 text-xs text-ink-40">
                        Translated from {LANG_NAMES[m.lang]}
                      </p>
                    )}
                    <div
                      className={
                        'rounded-card px-3.5 py-2.5 text-base ' +
                        (own
                          ? 'rounded-br-[4px] bg-ink text-white'
                          : 'rounded-bl-[4px] bg-surface-alt text-ink')
                      }
                    >
                      <span key={showing ? 't' : 'o'} className="foc-fade block">
                        {showing ? m.translation : m.text}
                      </span>
                    </div>
                    {translatable && !autoTranslate && (
                      <button
                        type="button"
                        onClick={() =>
                          setTranslated((prev) => ({ ...prev, [m.id]: !prev[m.id] }))
                        }
                        className="mt-1 flex min-h-[44px] items-center gap-1 text-xs font-medium text-blue hover:underline md:min-h-0"
                      >
                        <Languages size={13} aria-hidden="true" />
                        {translated[m.id] ? 'Show original' : 'Translate'}
                      </button>
                    )}
                    <p className={'tnum mt-1 text-xs text-ink-40 ' + (own ? 'text-right' : '')}>
                      {m.at}
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>

          <form
            className="flex items-center gap-2 border-t border-line px-3 py-3 md:px-4"
            onSubmit={(e) => e.preventDefault()}
          >
            <button
              type="button"
              disabled={isSystem}
              aria-label="Attach a file"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-btn text-ink-70 hover:bg-surface-alt disabled:text-ink-40"
            >
              <Paperclip size={18} aria-hidden="true" />
            </button>
            <input
              type="text"
              disabled={isSystem}
              placeholder={isSystem ? 'You cannot reply to FoC' : 'Message ' + firstName(other)}
              aria-label={isSystem ? 'Replies are not available' : 'Message ' + firstName(other)}
              className={
                'h-11 min-w-0 flex-1 rounded-pill border border-line px-4 text-base ' +
                (isSystem
                  ? 'cursor-not-allowed bg-surface-alt text-ink-40'
                  : 'bg-surface text-ink')
              }
            />
            <button
              type="submit"
              disabled={isSystem}
              aria-label="Send message"
              className={
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-pill transition-colors duration-150 ' +
                (isSystem
                  ? 'cursor-not-allowed bg-surface-alt text-ink-40'
                  : 'bg-ink text-white hover:bg-ink-70')
              }
            >
              <Send size={17} aria-hidden="true" />
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
