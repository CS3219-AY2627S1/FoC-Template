/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-03
 * Scope: Generated the hand-off that puts an order's status pill beside its
 *        reference in the desktop nav trail.
 * Reviewed by Ngooi Jun Sen.
 *
 * AppShell draws the trail ("My requests / Request #…") from the URL alone,
 * but the status lives in the order the page has loaded. The page reports it
 * here, so desktop shows the pill beside the reference as the mobile header does.
 */

import { createContext, useContext, useEffect } from 'react';
import type { OrderStatus } from '../ui/StatusBadge';

export const OrderTrailContext = createContext<(status: OrderStatus | null) => void>(() => undefined);

/** Shows `status` in the nav trail while the calling page is open. */
export function useOrderTrailStatus(status: OrderStatus): void {
  const setStatus = useContext(OrderTrailContext);
  useEffect(() => {
    setStatus(status);
    return () => setStatus(null);
  }, [setStatus, status]);
}
