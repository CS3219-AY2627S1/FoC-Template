/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
 * Scope: Shared layout of the sign-in and create-account pages, following the D1 mockup.
 * Author review: Reviewed and approved by @t-leongchuan
 */
import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import { APP_NAME } from '../config'

interface AuthLayoutProps {
  heading: string
  cardTitle: string
  children: ReactNode
}

// Page frame shared by Login and Register: tagline, big heading, the
// "Sign in | Create account" switch, then a white card holding the form.
export function AuthLayout({ heading, cardTitle, children }: AuthLayoutProps) {
  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition ${
      isActive ? 'bg-navy-800 text-white' : 'bg-navy-100 text-navy-800 hover:bg-slate-200'
    }`

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
      <p className="text-xs font-semibold text-accent-500">{APP_NAME} · Your campus, connected</p>
      <h1 className="mt-2 text-3xl font-bold text-navy-900">{heading}</h1>
      <p className="mt-1 text-sm text-slate-500">Request a helping hand or earn credits by delivering an errand.</p>

      <nav className="mt-5 flex gap-2" aria-label="Sign in or create an account">
        <NavLink to="/login" className={tabClass}>
          Sign in
        </NavLink>
        <NavLink to="/register" className={tabClass}>
          Create account
        </NavLink>
      </nav>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-navy-900">{cardTitle}</h2>
        <div className="mt-4">{children}</div>
      </section>
    </main>
  )
}

// Shared button style for the forms
export const primaryButtonClass =
  'inline-flex items-center justify-center rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-60'
