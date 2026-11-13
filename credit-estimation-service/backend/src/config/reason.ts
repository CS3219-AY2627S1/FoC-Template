// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-11-09
// Scope: Integrated author-defined explanation and output truncation limits
// Author review: Reviewed outputs, corrected phrasing and syntax, and adjusted implementation
// details to fit project requirements.

export const MAX_REASON_LENGTH = 160

export const SHORT_TIME_EXPLANATION = 'Shorter availability also increased the suggested range.'
export const LONG_TIME_EXPLANATION = 'Longer availability also reduced the suggested range.'

const MAX_TIME_EXPLANATION_LENGTH = Math.max(
  SHORT_TIME_EXPLANATION.length,
  LONG_TIME_EXPLANATION.length,
)

// Reserve two characters for the period and space inserted before the time explanation.
export const MAX_AI_REASON_LENGTH = MAX_REASON_LENGTH - MAX_TIME_EXPLANATION_LENGTH - 2

export function limitReasonAtWord(reason: string, maximumLength: number): string {
  if (reason.length <= maximumLength) return reason

  const candidate = reason.slice(0, maximumLength + 1)
  const lastClauseBoundary = Math.max(
    candidate.lastIndexOf(','),
    candidate.lastIndexOf(';'),
    candidate.lastIndexOf(':'),
  )
  if (lastClauseBoundary >= Math.floor(maximumLength / 2)) {
    return candidate.slice(0, lastClauseBoundary).trimEnd()
  }

  const lastWordBoundary = candidate.lastIndexOf(' ')
  return candidate
    .slice(0, lastWordBoundary > 0 ? lastWordBoundary : maximumLength)
    .trimEnd()
    .replace(/[\s,;:.!?-]+$/, '')
}
