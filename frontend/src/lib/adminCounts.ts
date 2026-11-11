/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-02
 * Scope: Generated the signal that tells the admin menu its counts changed.
 * Reviewed by Ngooi Jun Sen.
 *
 * The admin menu shows how many suppliers and escalations are waiting. A page
 * that changes either (approving a supplier, resolving a case) calls
 * adminCountsChanged(), and the menu reads both counts again.
 */

import { useSyncExternalStore } from 'react';

let version = 0;
const listeners = new Set<() => void>();

export function adminCountsChanged(): void {
  version += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Changes every time adminCountsChanged() is called; use it as an effect dependency. */
export function useAdminCountsVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}
