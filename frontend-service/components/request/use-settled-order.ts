import { useEffect, useState } from 'react';

import { type OrderActionResult, pollNewOrder } from '@/lib/order-actions';
import type { OrderView } from '@/lib/orders';

// Credit Service reserves asynchronously over Kafka, usually within seconds.
const STATUS_POLL_MS = 1500;
const STATUS_POLL_ATTEMPTS = 20;
const STATUS_POLL_MAX_FAILURES = 3;

/**
 * Polls a new order until Credit Service has reserved its credit (`OPEN`) or
 * refused it (`REJECTED`). `stalled` turns true when polling gives up, after
 * repeated failed reads or too many attempts, while the order is still
 * pending.
 */
export function useSettledOrder(order: OrderView) {
  const [settled, setSettled] = useState(order);
  const [stalled, setStalled] = useState(false);
  const orderId = order.id;
  const initiallyPending = order.status === 'PENDING_CREDIT';

  useEffect(() => {
    if (!initiallyPending) return;

    let attempts = 0;
    let failures = 0;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      let result: OrderActionResult | null;
      try {
        result = await pollNewOrder(orderId);
      } catch {
        result = null;
      }
      if (cancelled) return;
      if (!result?.ok) {
        // One blip shouldn't hide the outcome, but keep failures bounded.
        if (++failures >= STATUS_POLL_MAX_FAILURES) {
          setStalled(true);
        } else {
          timer = setTimeout(poll, STATUS_POLL_MS);
        }
        return;
      }
      failures = 0;
      setSettled(result.order);
      if (result.order.status !== 'PENDING_CREDIT') return;
      if (++attempts < STATUS_POLL_ATTEMPTS) {
        timer = setTimeout(poll, STATUS_POLL_MS);
      } else {
        setStalled(true);
      }
    };
    timer = setTimeout(poll, STATUS_POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [orderId, initiallyPending]);

  return { settled, stalled };
}
