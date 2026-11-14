/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-fable-5-1), date: 2026-11-10
 * Scope: Extracted the email eye/eye-off icon button from AdminUsers.jsx's email cell (Stage
 *        20b) into a shared component, per instructions.md Stage 30's "Shared code" rule, so
 *        the admin user page's profile email renders the identical control. Markup, aria-label
 *        ("Show/Hide email for <username>"), classes, size and the click's stopPropagation
 *        (so a table-row click handler does not also fire) are unchanged from AdminUsers.jsx.
 *        The icon is always visible, not hover-only, per the stage's touch rule.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { Eye, EyeOff } from 'lucide-react'

/** `unmask` is the object returned by utils/emailUnmask.js's useEmailUnmask. */
export default function EmailUnmaskButton({ user, unmask }) {
  const revealed = unmask.isUnmasked(user.id)
  return (
    <button
      type="button"
      aria-label={(revealed ? 'Hide email for ' : 'Show email for ') + user.username}
      onClick={(e) => {
        e.stopPropagation()
        unmask.toggle(user)
      }}
      disabled={unmask.busyId === user.id}
      className="shrink-0 text-ink-40 hover:text-ink disabled:opacity-50"
    >
      {revealed ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
    </button>
  )
}
