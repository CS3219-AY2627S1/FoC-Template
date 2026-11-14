/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component Footer.jsx from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: <pending — team member to sign>
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-10
 * Scope (2026-11-10): Removed the "UI prototype" wording from the footer text, per George's
 *        chat instruction. No requirements, architecture, schema, or API decisions were made
 *        by the AI tool.
 * Author review: George Yeo
 */

import Logo from './Logo'

export default function Footer() {
  return (
    <footer className="mt-20 border-t border-line bg-surface">
      <div className="page-width page-gutter flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="text-sm text-ink-40">Peer-to-peer errands on campus</span>
        </div>
        <p className="max-w-prose text-xs text-ink-40">
          Credits stay inside FoC. They are not money and cannot be bought, cashed out, or
          transferred outside a completed errand. CS3219 AY2627S1 Group 18.
        </p>
      </div>
    </footer>
  )
}
