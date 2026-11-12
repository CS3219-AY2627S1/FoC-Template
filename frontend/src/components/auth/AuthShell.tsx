/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-5.6-sol), 2026-10-14
 * Scope (AI-15): Implemented and tested the requested create-account UI.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 */

import type { ReactNode } from 'react'
import routeIcon from '../../assets/route.svg'

const BENEFITS = [
  'Help fellow students with campus errands',
  'Earn credits on trips you already make',
  'Use credits when you need a helping hand',
]

type AuthShellProps = {
  eyebrow: string
  title: string
  description: string
  children: ReactNode
  footer: ReactNode
}

export function AuthShell({ eyebrow, title, description, children, footer }: AuthShellProps) {
  return (
    <main className="min-h-screen bg-[#f4f7f4] text-[#17211d]">
      <header className="flex h-[76px] items-center border-b border-[#dde3de] bg-white px-6 sm:px-8">
        <div className="flex items-center gap-3" aria-label="Campus Couriers">
          <span className="grid size-10 place-items-center rounded-xl bg-[#175c45]">
            <img src={routeIcon} alt="" width="20" height="20" />
          </span>
          <span className="text-lg font-semibold tracking-[-0.02em]">Campus Couriers</span>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-76px)] lg:grid-cols-[minmax(28rem,45%)_1fr]">
        <aside className="hidden flex-col justify-between overflow-hidden bg-[#0d3c2d] px-12 py-16 text-white lg:flex xl:px-[4.5rem]">
          <div className="max-w-[34rem]">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-semibold tracking-[0.04em]">
              <span className="size-2 rounded-full bg-[#d8f06b]" aria-hidden="true" />
              BUILT FOR THE NUS COMMUNITY
            </div>

            <h1 className="mt-7 text-[clamp(2.5rem,3.4vw,3.5rem)] font-medium leading-[1.05] tracking-[-0.04em]">
              Welcome to Campus Couriers.
            </h1>
            <p className="mt-6 max-w-[25rem] text-base leading-7 text-[#d9e5df]">
              Request an errand, lend a hand on your route, and keep campus moving together.
            </p>

            <ul className="mt-8 space-y-4">
              {BENEFITS.map((benefit) => (
                <li key={benefit} className="flex items-center gap-3 text-sm">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#d8f06b] font-bold text-[#0d3c2d]">
                    ✓
                  </span>
                  {benefit}
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <section className="flex items-start justify-center px-5 py-10 sm:px-8 sm:py-16 lg:px-16">
          <div className="w-full max-w-[29rem] rounded-[1.25rem] border border-[#dde3de] bg-white p-6 shadow-[0_18px_50px_rgba(22,59,42,0.09)] sm:p-8">
            <p className="text-xs font-semibold tracking-[0.08em] text-[#175c45]">{eyebrow}</p>
            <h2 className="mt-2 text-[2rem] font-semibold leading-tight tracking-[-0.035em]">
              {title}
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#68736c]">{description}</p>

            {children}

            <div className="mt-6 text-center text-xs leading-5 text-[#68736c]">{footer}</div>
          </div>
        </section>
      </div>
    </main>
  )
}
