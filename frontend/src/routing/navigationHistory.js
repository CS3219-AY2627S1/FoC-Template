/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-05
 * Scope: Created per instructions.md Stage 22's chat back-arrow decision ("goes back to the
 *        previous page ... When there is no previous in-app page ... it goes to the current
 *        view's main page"). A module-level counter (same pattern as AuthContext's
 *        pendingAuthMessage) rather than React state, since each browser tab gets its own fresh
 *        module instance on load — recordNavigation is called by App.jsx's
 *        NavigationHistoryTracker on every PUSH/POP route change after the first, so
 *        hasPreviousPage() is false exactly when the current page was the tab's entry point
 *        (direct URL or new tab) and true once the visitor has navigated within the app.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

let depth = 0

export function recordNavigation() {
  depth += 1
}

export function hasPreviousPage() {
  return depth > 0
}

export function resetNavigationHistory() {
  depth = 0
}
