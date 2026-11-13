/**
 * AI Assistance Disclosure:
 * Tool: Claude (Opus 5.5), date: 2026-11-10
 * Scope: USER_REGISTERED event envelope and validation
 * Author review: Reviewed and tested locally
 */

export interface UserRegisteredEvent {
  event_id: string;
  event_type: "USER_REGISTERED";
  timestamp: string;
  data: { user_id: string; email: string };
}

export function parseUserRegisteredEvent(raw: unknown): UserRegisteredEvent {
  const e = raw as Partial<UserRegisteredEvent> | null;
  if (!e || typeof e.event_id !== "string" || e.event_type !== "USER_REGISTERED") {
    throw new Error("Not a USER_REGISTERED event");
  }
  if (
    !e.data ||
    typeof e.data.user_id !== "string" ||
    typeof e.data.email !== "string" ||
    !e.data.email.includes("@")
  ) {
    throw new Error(`Event ${e.event_id} has invalid data`);
  }
  return e as UserRegisteredEvent;
}
