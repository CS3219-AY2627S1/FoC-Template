/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-03
 * Scope: Generated the credit column of My requests and My deliveries, which
 *        says where the credits went on a disputed order.
 * Reviewed by Ngooi Jun Sen.
 */

import { creditOutcome, type Order } from '../../lib/orders';
import styles from './orderList.module.css';

export function CreditCell({ order, viewer, label }: { order: Order; viewer: 'requester' | 'courier'; label: string }) {
  const outcome = creditOutcome(order, viewer);
  return (
    <div className={styles.reward} role="cell">
      <span className={styles.cellLabel}>{label}</span>
      {/* Crossed out when these credits did not change hands for this person. */}
      <span className={outcome.returned ? styles.rewardNone : undefined}>{outcome.amount ?? '—'}</span>
      {outcome.note !== null ? <span className={styles.rewardNote}>{outcome.note}</span> : null}
    </div>
  );
}
