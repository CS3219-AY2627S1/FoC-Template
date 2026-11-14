/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Created ElevateTimer, the new component instructions.md Stage 27c's decisions table
 *        calls for beside the "Elevate privileges" button on /admin/users: a plain mm:ss
 *        display of the remaining elevation window. Counting down and disappearing at zero is
 *        the caller's job (it renders this only while elevated, driven by useElevation in
 *        utils/elevation.js), so this component holds no state of its own.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

export default function ElevateTimer({ secondsLeft }) {
  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60
  return (
    <span className="tnum text-sm text-ink-70" aria-live="polite">
      Unlocked for {minutes}:{String(seconds).padStart(2, '0')}
    </span>
  )
}
