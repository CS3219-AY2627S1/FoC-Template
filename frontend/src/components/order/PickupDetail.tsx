/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-02
 * Scope: Generated the pickup point's building, floor and description line
 *        on the order pages.
 * Reviewed by Ngooi Jun Sen.
 *
 * The order names the pickup but carries only the Supplier Service id for
 * where exactly it is, so this looks the supplier up. Nothing shows when the
 * lookup fails or the supplier has no location details: the name above it is
 * still enough to go on.
 */

import { useEffect, useState } from 'react';
import { fetchSupplier } from '../../lib/suppliers';

interface PickupDetailProps {
  /** The order's pickup id, a Supplier Service id. */
  supplierId: string;
  className?: string;
}

export function PickupDetail({ supplierId, className }: PickupDetailProps) {
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    const id = Number(supplierId);
    if (!Number.isInteger(id)) return undefined;

    fetchSupplier(id)
      .then((supplier) => {
        if (cancelled) return;
        const place = [supplier.building, supplier.floor ? `Level ${supplier.floor}` : null]
          .filter(Boolean)
          .join(' · ');
        const parts = [place, supplier.locationDescription].filter((part) => part && part.trim() !== '');
        setDetail(parts.length > 0 ? parts.join(', ') : null);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      });

    return () => {
      cancelled = true;
    };
  }, [supplierId]);

  return detail === null ? null : <p className={className}>{detail}</p>;
}
