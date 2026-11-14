/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-22
 * Scope: Created FormBanner, the whole-form error/success banner used by Login, Register,
 *        ForgotPassword and the Account sections, per instructions.md Stage 16b.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

const TONES = {
  error: 'border-alert bg-alert/5 text-alert',
  success: 'border-blue bg-blue/5 text-blue',
  info: 'border-line bg-surface-alt text-ink-70',
}

export default function FormBanner({ type = 'error', message }) {
  if (!message) return null
  return (
    <p role={type === 'error' ? 'alert' : 'status'} className={'mb-4 rounded-card border p-3 text-sm ' + TONES[type]}>
      {message}
    </p>
  )
}
