/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component EmptyState.jsx from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: <pending — team member to sign>
 */

export default function EmptyState({ title, body, action }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
      <p className="text-lg font-semibold text-ink">{title}</p>
      {body && <p className="max-w-prose text-sm text-ink-70">{body}</p>}
      {action}
    </div>
  )
}
