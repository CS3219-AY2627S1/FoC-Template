/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component Button.jsx from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: Congchen
 */

const VARIANTS = {
  primary: 'bg-ink text-white border border-ink hover:bg-ink-70 hover:border-ink-70',
  secondary: 'bg-surface text-ink border border-line hover:border-ink',
  ghost: 'bg-transparent text-ink border border-transparent hover:bg-surface-alt',
  danger: 'bg-surface text-alert border border-alert hover:bg-alert hover:text-white',
}

// Mobile keeps a 44px minimum tap target (blueprint §8); desktop uses the design heights.
const SIZES = {
  sm: 'min-h-[44px] md:min-h-0 h-11 md:h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  disabled = false,
  as: As = 'button',
  ...props
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-btn font-medium transition-colors duration-150 select-none'
  const disabledStyle =
    'bg-surface-alt text-ink-40 border border-line cursor-not-allowed hover:bg-surface-alt hover:text-ink-40 hover:border-line'
  return (
    <As
      className={`${base} ${SIZES[size]} ${disabled ? disabledStyle : VARIANTS[variant]} ${className}`}
      disabled={As === 'button' ? disabled : undefined}
      aria-disabled={disabled || undefined}
      {...props}
    />
  )
}
