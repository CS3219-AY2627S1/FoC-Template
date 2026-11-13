import type { CreditBalanceResult } from '@/lib/credit-actions';
import type { CreditTransaction } from '@/lib/credit-service';
import { MAX_CREDIT_AMOUNT } from '@/lib/orders';

/** Credit Service reason codes for settlements, from `event_handlers.py`. */
const SETTLEMENT_LABELS: Record<string, string> = {
  ORDER_COMPLETED_REQUESTER_DEBIT: 'Paid to your courier',
  ORDER_COMPLETED_COURIER_CREDIT: 'Earned from an errand',
  ORDER_CANCELLED_AFTER_PICKUP_REQUESTER_DEBIT:
    'Paid to your courier (cancelled after pickup)',
  ORDER_CANCELLED_AFTER_PICKUP_COURIER_CREDIT:
    'Earned from an errand (cancelled after pickup)',
};

export function describeTransaction({
  transaction_type,
  outcome,
  reason,
}: CreditTransaction) {
  switch (transaction_type) {
    case 'INITIAL_ALLOCATION':
      return 'Starting credit';
    case 'RESERVATION':
      if (outcome === 'SUCCEEDED') return 'Held for your errand';
      return reason === 'INSUFFICIENT_CREDIT'
        ? 'Errand refused: not enough credit'
        : 'Errand refused: credit could not be reserved';
    case 'TRANSFER':
      return SETTLEMENT_LABELS[reason] ?? 'Errand settlement';
    case 'RELEASE':
      return reason === 'ORDER_EXPIRED'
        ? 'Returned: errand expired'
        : 'Returned: errand cancelled';
    case 'ADMIN_ADJUSTMENT':
      return `Adjusted by an administrator: ${reason}`;
    default:
      // A type Credit Service added after this was written.
      return 'Credit activity';
  }
}

export type CreditChangeTone = 'gain' | 'loss' | 'movement' | 'none';

/**
 * Holds and releases move credit between available and reserved without
 * changing the total, so show those as movements rather than gains or losses.
 */
export function formatCreditChange({
  available_delta,
  reserved_delta,
}: CreditTransaction): { text: string; tone: CreditChangeTone } {
  const net = available_delta + reserved_delta;
  if (net > 0) return { text: `+${net} cr`, tone: 'gain' };
  if (net < 0) return { text: `${net} cr`, tone: 'loss' };
  if (reserved_delta > 0)
    return { text: `${reserved_delta} cr held`, tone: 'movement' };
  if (reserved_delta < 0)
    return { text: `${-reserved_delta} cr returned`, tone: 'movement' };
  return { text: 'No change', tone: 'none' };
}

/** Default reward offered on a new errand, when the balance allows it. */
const DEFAULT_OFFER = 10;

/**
 * Bounds for the reward stepper. Credit Service decides at reservation time;
 * this cap only avoids offers that are sure to be rejected. Without an account
 * yet, the first errand opens one with the initial allocation before reserving
 * from it. If the balance couldn't be read, only Order Service's limit applies.
 */
export function offerLimits(
  credit: CreditBalanceResult,
  initialAllocation: number,
) {
  const available = credit.ok
    ? (credit.balance?.available_balance ?? initialAllocation)
    : MAX_CREDIT_AMOUNT;
  const max = Math.min(MAX_CREDIT_AMOUNT, available);
  return {
    max,
    hasCredit: max >= 1,
    initial: Math.max(1, Math.min(DEFAULT_OFFER, max)),
  };
}
