/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: N2 wording on the create page, as approved in the N2 spec (section 3.6).
 * Author review: Pending review by @mattis.
 */

export const UNAVAILABLE_TEXT =
  "Filling in the form from a description isn't available right now. You can still fill in the form below."

export const FAILURE_TEXT = "We couldn't fill in the form from your description. Please fill it in yourself."

export function rateLimitText(seconds: number): string {
  return `You've reached the limit for filling in forms. Try again in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`
}

export const FILLED_LABEL = 'From your description'
