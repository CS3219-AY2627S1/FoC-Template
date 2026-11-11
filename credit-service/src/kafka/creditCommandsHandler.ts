/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-08
 * Scope: Credit Service source code, drafted and edited with Claude Code.
 * Reviewed by Don Lee
 */

import { cancelOrder, completeOrder, type Settlement } from '../services/credit.service.js';
import { asUuid, parseObject } from './messages.js';

// foc.credit.commands, as published by the order service (its
// OrderMessageFactory): a flat envelope { eventId, eventType, schemaVersion,
// occurredAt, orderId, ... }, keyed by orderId. Declared independently here (no
// shared package across the service boundary) and parsed defensively.
//
//   credit.reservation.release { requesterId, courierId, amount, reason }
//     reason ACKNOWLEDGED | UNACKNOWLEDGED → F4.3 completion: pay the courier.
//   credit.reservation.return  { requesterId, amount, reason }
//     reason EXPIRED → F4.2 expiry, otherwise cancellation: refund the requester.
//
// The credits moved are the reservation credit holds, not the message's amount.

/**
 * Parse and apply one `foc.credit.commands` message.
 *
 * Malformed or unknown messages are logged and skipped, as is a command for an
 * order with no active reservation (already settled: a redelivery). A DB error —
 * including a courier with no credit account — propagates, so the offset stays
 * uncommitted and the message is retried. There is no dead-letter queue yet, so
 * until there is, such a message holds up its partition.
 */
export async function handleCreditCommandMessage(
  rawValue: string | null,
  log: (message: string) => void = console.warn,
): Promise<void> {
  const command = parseObject(rawValue);
  if (!command) {
    log('credit.commands: empty, non-JSON or non-object message, skipping');
    return;
  }

  const { eventType } = command;
  if (eventType !== 'credit.reservation.release' && eventType !== 'credit.reservation.return') {
    log(`credit.commands: ignoring event type ${String(eventType)}`);
    return;
  }

  const orderId = asUuid(command.orderId);
  if (!orderId) {
    log(`credit.commands: ${eventType} with missing/invalid orderId, skipping`);
    return;
  }
  const eventId = asUuid(command.eventId);

  let settlement: Settlement;
  if (eventType === 'credit.reservation.release') {
    const courierId = asUuid(command.courierId);
    if (!courierId) {
      log(`credit.commands: release of order ${orderId} with missing/invalid courierId, skipping`);
      return;
    }
    settlement = await completeOrder(orderId, courierId, eventId);
  } else {
    const operation = command.reason === 'EXPIRED' ? 'EXPIRY' : 'CANCELLATION';
    settlement = await cancelOrder(orderId, operation, eventId);
  }

  if (settlement === 'not-reserved') {
    log(`credit.commands: order ${orderId} has no active reservation (already settled), skipping`);
  } else if (settlement === 'forfeited') {
    log(`credit.commands: order ${orderId} settled; its recipient's account is deleted, credits forfeited`);
  }
}
