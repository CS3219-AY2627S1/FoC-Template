// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-10-22
//  2026-10-22: Credit transfer consumer - the error classification table agreed with
//    order-service on 2026-10-20. One table, not scattered catch blocks, so the
//    disposition of every outcome can be read in one place.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

import { AppError } from '../utils/AppError.js';

/**
 * What the worker does with a failed transfer.
 *
 * - `success`  — the work is already done; ack the job, do not retry, do not dead-letter.
 * - `permanent` — retrying cannot help; UnrecoverableError, straight to the dead letter.
 * - `retry`    — transient; let BullMQ schedule the next attempt.
 */
export type Disposition = 'success' | 'permanent' | 'retry';

/**
 * THE CLASSIFICATION TABLE (contract agreed with order-service, 2026-10-20).
 *
 * Keyed on credit-service's own error `code`, not on an HTTP status: the worker calls
 * transferCredits directly and receives the AppError object, so the code is a typed
 * field rather than something parsed back out of a response body.
 *
 *   code                    | status | disposition | why
 *   ------------------------|--------|-------------|---------------------------------
 *   ALREADY_TRANSFERRED     |  409   | success     | F19.3.2 — already done. A redelivery
 *                           |        |             | of the same completion, which is
 *                           |        |             | normal under at-least-once delivery.
 *   RESERVATION_NOT_FOUND   |  404   | permanent   | Nothing was ever reserved for this
 *                           |        |             | request; no retry will create one.
 *   COURIER_NOT_FOUND       |  404   | permanent   | Credits may only enter the economy
 *                           |        |             | via F19.1.1, so this service will
 *                           |        |             | never create the courier's balance.
 *   BALANCE_NOT_FOUND       |  404   | permanent   | The requester's row is missing;
 *                           |        |             | nothing here can restore it.
 *   ALREADY_RELEASED        |  409   | permanent   | The credits went back to the
 *                           |        |             | requester. Needs a human, not a retry.
 *   INVALID_REQUEST_BODY    |  400   | permanent   | Malformed payload (covered by the
 *                           |        |             | `any other 4xx` rule; listed for
 *                           |        |             | readability).
 */
const DISPOSITION_BY_CODE: Readonly<Record<string, Disposition>> = {
  ALREADY_TRANSFERRED: 'success',
  RESERVATION_NOT_FOUND: 'permanent',
  COURIER_NOT_FOUND: 'permanent',
  BALANCE_NOT_FOUND: 'permanent',
  ALREADY_RELEASED: 'permanent',
  INVALID_REQUEST_BODY: 'permanent',
};

/**
 * Anything not named in the table above:
 *
 *   4xx  -> permanent. An unknown client-side rejection will be rejected identically on
 *           every attempt, and retrying a malformed payload for thirteen minutes helps
 *           nobody. Dead-lettering surfaces it instead.
 *   5xx  -> retry. BALANCE_INVARIANT_VIOLATION and INTERNAL_ERROR are this service
 *           failing, which may be transient.
 *   not an AppError -> retry. A connection reset, a pool timeout, a Postgres error that
 *           escaped the service layer: all transient by nature.
 */
export function classifyTransferError(error: unknown): Disposition {
  if (!(error instanceof AppError)) return 'retry';

  const known = DISPOSITION_BY_CODE[error.code];
  if (known !== undefined) return known;

  return error.status >= 400 && error.status < 500 ? 'permanent' : 'retry';
}
