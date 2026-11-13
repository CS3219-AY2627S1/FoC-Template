/**
 * AI Assistance Disclosure:
 * Tool: Claude (Sonnet 5.5), date: 2026-10-19
 * Scope: HTTP client for the credit service (reserve only)
 * Author review: Reviewed and tested locally
 *
 *
 * Only POST /api/credit/tx/reserve is a direct call (it must succeed before
 * an order exists). Release and transfer happen via RabbitMQ events instead.
 *
 * The credit service's exact error contract is not documented yet, so:
 *   - network error / timeout / 5xx / 401 / 403  -> 503 (credit service down or misconfigured)
 *   - any other 4xx (e.g. insufficient credits)  -> 409, passing its message through
 * Revisit once the credit service documents its status codes.
 */

import { env } from "../config/env.ts";
import { conflict, serviceUnavailable } from "../utils/httpError.ts";

export interface ReserveInput {
  orderId: string;
  userId: string;
  amount: number;
}

export async function reserve({ orderId, userId, amount }: ReserveInput): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (env.INTERNAL_API_KEY) headers["X-Internal-Api-Key"] = env.INTERNAL_API_KEY;

  let res: Response;
  try {
    res = await fetch(`${env.CREDIT_SERVICE_URL}/api/credit/tx/reserve`, {
      method: "POST",
      headers,
      body: JSON.stringify({ order_id: orderId, requester_id: userId, amount }),
      signal: AbortSignal.timeout(env.CREDIT_TIMEOUT_MS),
    });
  } catch (err) {
    console.error(`Credit service unreachable: ${(err as Error).message}`);
    throw serviceUnavailable("Credit service is unavailable, please try again");
  }

  if (res.ok) return;

  const body = (await res.json().catch(() => ({}))) as { message?: string };
  const detail = body.message || `HTTP ${res.status}`;

  if (res.status >= 500 || res.status === 401 || res.status === 403) {
    console.error(`Credit service error on reserve (${res.status}): ${detail}`);
    throw serviceUnavailable("Credit service is unavailable, please try again");
  }

  throw conflict(`Could not reserve credits: ${detail}`, "CREDIT_RESERVATION_REJECTED");
}