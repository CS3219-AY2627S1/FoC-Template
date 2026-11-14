/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component CreditPill.jsx from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: Congchen
 */

// The signature element. Black filled capsule, white tabular number.
// The "white" variant is used where the pill sits on a dark or bordered surface.
const SIZES = {
  sm: 'h-6 px-2.5 text-[13px] gap-1',
  md: 'h-8 px-3 text-[15px] gap-1.5',
  lg: 'h-14 px-5 text-[28px] gap-2',
}

export default function CreditPill({ value, size = 'sm', variant = 'filled', className = '' }) {
  const filled = variant === 'filled'
  return (
    <span
      className={`inline-flex items-center rounded-pill font-semibold tnum ${SIZES[size]} ${
        filled ? 'bg-ink text-white' : 'border border-line bg-surface text-ink'
      } ${className}`}
    >
      <span>{value}</span>
      <span className={`font-medium ${filled ? 'text-white/70' : 'text-ink-40'} ${size === 'lg' ? 'text-base' : 'text-[0.8em]'}`}>
        cr
      </span>
    </span>
  )
}
