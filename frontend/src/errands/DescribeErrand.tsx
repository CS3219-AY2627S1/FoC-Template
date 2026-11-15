/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: N2 description box above the create-errand form: status check, 1000-character box with a counter,
 *        "Fill in the form", the failure message and the rate-limit countdown, per the approved N2 spec.
 * Author review: Reviewed and approved by @mattis.
 */
import { useEffect, useId, useState } from 'react'
import { ApiError } from '../api/client'
import { extractErrand, getExtractionStatus } from '../api/errandApi'
import { FAILURE_TEXT, UNAVAILABLE_TEXT, rateLimitText } from './extractionCopy'
import { MAX_DESCRIPTION, type ExtractedErrand } from './types'
import { useRemoteData } from './useRemoteData'

interface DescribeErrandProps {
  /** Called just before the request is sent, so the page can note fields edited while it runs */
  readonly onRequestStart: () => void
  /** Called with the extraction; the page fills only fields with a value */
  readonly onFilled: (extracted: ExtractedErrand) => void
  /** Called after onFilled or a failure, when the request is over */
  readonly onRequestEnd: () => void
}

export function DescribeErrand({ onRequestStart, onFilled, onRequestEnd }: DescribeErrandProps) {
  const headingId = useId()
  const textId = useId()
  const counterId = useId()
  const status = useRemoteData('extract-status', (signal) => getExtractionStatus(signal))
  const [description, setDescription] = useState('')
  const [running, setRunning] = useState(false)
  const [failed, setFailed] = useState(false)
  const [waitSeconds, setWaitSeconds] = useState(0)

  // The rate-limit countdown, one second at a time; the button stays disabled until it ends
  useEffect(() => {
    if (waitSeconds <= 0) return
    const timer = window.setTimeout(() => setWaitSeconds((seconds) => seconds - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [waitSeconds])

  // Unavailable whatever the reason, including a failed status call; still loading counts as not yet usable
  const checking = status.data === null && status.error === null
  const available = status.data?.available === true

  async function fill() {
    setFailed(false)
    setRunning(true)
    onRequestStart()
    try {
      onFilled(await extractErrand(description))
    } catch (error) {
      if (error instanceof ApiError && error.status === 429 && error.retryAfterSeconds !== undefined) {
        setWaitSeconds(error.retryAfterSeconds)
      } else {
        setFailed(true)
      }
    } finally {
      setRunning(false)
      onRequestEnd()
    }
  }

  return (
    <section aria-labelledby={headingId} className="rounded-2xl border border-navy-100 bg-navy-50 p-5 sm:p-6">
      <h2 id={headingId} className="text-base font-bold text-navy-900">
        Describe your errand
      </h2>
      {!checking && !available ? (
        <p className="mt-2 text-sm text-slate-600">{UNAVAILABLE_TEXT}</p>
      ) : (
        <>
          <label htmlFor={textId} className="mt-1 block text-sm text-slate-600">
            Say what you need in your own words, then check the details we fill in below before you post.
          </label>
          <textarea
            id={textId}
            rows={3}
            value={description}
            maxLength={MAX_DESCRIPTION}
            aria-describedby={counterId}
            onChange={(event) => setDescription(event.target.value.slice(0, MAX_DESCRIPTION))}
            placeholder="e.g. Two iced lattes from TOMORO COFFEE to the COM2 level 2 study area by 9pm tonight. I'll pay 15 credits."
            className="mt-3 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-100"
          />
          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => void fill()}
              disabled={checking || running || waitSeconds > 0 || description.trim() === ''}
              className="min-h-11 rounded-lg bg-navy-800 px-5 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-50"
            >
              {running ? 'Filling in…' : 'Fill in the form'}
            </button>
            <span id={counterId} className="text-right text-xs text-slate-500">
              {description.length}/{MAX_DESCRIPTION}
            </span>
          </div>
          {failed && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {FAILURE_TEXT}
            </p>
          )}
          {waitSeconds > 0 && (
            <p role="status" className="mt-3 text-sm text-amber-800">
              {rateLimitText(waitSeconds)}
            </p>
          )}
        </>
      )}
    </section>
  )
}
