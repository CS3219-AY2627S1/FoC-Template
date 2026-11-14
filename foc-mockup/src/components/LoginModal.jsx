/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component LoginModal.jsx from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 */

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import Button from './Button'
import Logo from './Logo'
import { useDemo } from '../context/DemoContext'

// Purely visual. Submitting or closing just flips the demo auth state.
export default function LoginModal() {
  const { loginPrompt, setLoginPrompt, setIsLoggedIn } = useDemo()
  const firstField = useRef(null)

  useEffect(() => {
    if (!loginPrompt) return undefined
    firstField.current?.focus()
    const onKey = (e) => e.key === 'Escape' && setLoginPrompt(null)
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [loginPrompt, setLoginPrompt])

  if (!loginPrompt) return null

  const logIn = (e) => {
    e.preventDefault()
    setIsLoggedIn(true)
    setLoginPrompt(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={() => setLoginPrompt(null)}
        className="absolute inset-0 bg-black/45"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
        className="foc-fade relative w-full max-w-[440px] rounded-card bg-surface p-6 shadow-modal sm:p-8"
      >
        <button
          type="button"
          onClick={() => setLoginPrompt(null)}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-btn text-ink-70 hover:bg-surface-alt"
          aria-label="Close dialog"
        >
          <X size={18} aria-hidden="true" />
        </button>

        <Logo asLink={false} />
        <h2 id="login-title" className="font-display mt-5 text-2xl font-bold text-ink">
          Log in to continue
        </h2>
        <p className="mt-2 text-sm text-ink-70">{loginPrompt.action}</p>

        <form className="mt-6 space-y-4" onSubmit={logIn}>
          <label className="block">
            <span className="text-sm font-medium text-ink">Email or username</span>
            <input
              ref={firstField}
              type="text"
              defaultValue="weejean@u.nus.edu"
              className="mt-1.5 h-11 w-full rounded-btn border border-line bg-surface-alt px-3 text-base text-ink"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-ink">Password</span>
            <input
              type="password"
              defaultValue="password"
              className="mt-1.5 h-11 w-full rounded-btn border border-line bg-surface-alt px-3 text-base text-ink"
            />
          </label>
          <Button type="submit" size="lg" className="w-full">
            Log in
          </Button>
          <div className="text-center">
            <a href="#forgot" className="text-sm font-medium text-blue hover:underline">
              Forgot password?
            </a>
          </div>
        </form>

        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-line" />
          <span className="text-xs text-ink-40">or</span>
          <span className="h-px flex-1 bg-line" />
        </div>
        <Button variant="secondary" size="lg" className="w-full" onClick={logIn}>
          Create an account
        </Button>
      </div>
    </div>
  )
}
