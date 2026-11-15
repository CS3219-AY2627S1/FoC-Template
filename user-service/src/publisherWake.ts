// Additional AI assistance: Codex (GPT-6), 2026-10-18. Scope: account-status publishing and verification. Author review: Reviewed and approved by @phuc.
// Wake-ups are hints only; durable work stays in the outbox and polling is the fallback.
const listeners = new Set<() => void>();
export function wakePublisher(): void {
  for (const listener of listeners) listener();
}
export function onPublisherWake(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
