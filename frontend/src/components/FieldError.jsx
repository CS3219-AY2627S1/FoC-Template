/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-22
 * Scope: Created FieldError, the inline field-error line used throughout the auth/account
 *        forms, per instructions.md Stage 16b.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

export default function FieldError({ message }) {
  if (!message) return null
  return (
    <p role="alert" className="mt-1.5 text-sm text-alert">
      {message}
    </p>
  )
}
