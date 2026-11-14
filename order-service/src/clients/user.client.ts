/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 d (instructions.md) - HTTP client for the scheduled-errands worker's
 *        fire-time user check: GET {USER_ORDER_SERVICE_URL}/users/worker/:id with header
 *        User-Order-Service-Key (secret USER_ORDER_SERVICE_API_KEY). Mirrors
 *        suppliers.client.ts's found/not_found/unavailable shape and 3 s timeout convention.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import type { Existence } from './suppliers.client.js';

export type UserAvailabilityStatus = 'pending' | 'active' | 'suspended';

export interface UserWorkerCheck {
  existence: Existence;
  /** Non-null only when `existence` is 'found'. */
  status: UserAvailabilityStatus | null;
  /** Non-null only when `existence` is 'found' and the user is currently locked. */
  lockedUntil: Date | null;
}

export interface UserClient {
  statusForWorker(userId: string): Promise<UserWorkerCheck>;
}

type FetchLike = typeof fetch;

export const USER_CALL_TIMEOUT_MS = 3_000;

const NOT_FOUND: UserWorkerCheck = { existence: 'not_found', status: null, lockedUntil: null };
const UNAVAILABLE: UserWorkerCheck = { existence: 'unavailable', status: null, lockedUntil: null };

function isAvailabilityStatus(value: unknown): value is UserAvailabilityStatus {
  return value === 'pending' || value === 'active' || value === 'suspended';
}

export function createHttpUserClient(
  baseUrl: string,
  serviceKey: string,
  fetchImpl: FetchLike = fetch,
  timeoutMs: number = USER_CALL_TIMEOUT_MS,
): UserClient {
  return {
    async statusForWorker(userId) {
      let res: Response;
      try {
        res = await fetchImpl(new URL(`/users/worker/${encodeURIComponent(userId)}`, baseUrl), {
          headers: { 'user-order-service-key': serviceKey, accept: 'application/json' },
          // In the worker's request path, so bounded, like suppliers.client.ts's calls.
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        return UNAVAILABLE; // refused / reset / DNS / timeout
      }

      if (!res.ok) return res.status === 404 ? NOT_FOUND : UNAVAILABLE;

      try {
        const body = (await res.json()) as { status?: unknown; lockedUntil?: unknown };
        if (!isAvailabilityStatus(body?.status)) return UNAVAILABLE;
        const lockedUntil =
          typeof body.lockedUntil === 'string' ? new Date(body.lockedUntil) : null;
        return { existence: 'found', status: body.status, lockedUntil };
      } catch {
        return UNAVAILABLE; // not the expected JSON
      }
    },
  };
}

/** Unit tests only: every user is found, active, never locked. */
export function createStubUserClient(): UserClient {
  return {
    async statusForWorker() {
      return { existence: 'found', status: 'active', lockedUntil: null };
    },
  };
}
