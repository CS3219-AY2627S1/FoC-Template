import type { Supplier } from '@/lib/supplier-service';

/** Page size for the store directory; Supplier Service allows up to 100. */
export const SUPPLIER_PAGE_SIZE = 20;

/** Numeric floors read as levels (`1` → `L1`); other labels such as `B1` stay as is. */
function formatFloor(floor: string) {
  const level = floor.match(/^L?(\d+)$/i);
  return level ? `L${level[1]}` : floor;
}

/** `COM2 L1`, or an empty string when building and floor are both missing. */
export function formatSupplierLocation(supplier: Supplier) {
  const floor = supplier.floor && formatFloor(supplier.floor);
  return [supplier.building, floor].filter(Boolean).join(' ');
}

/** `HH:MM:SS` → `HH:MM`. */
function formatTime(time: string) {
  return time.slice(0, 5);
}

/** Daily Asia/Singapore hours, as Supplier Service defines them. */
export function formatOpeningHours(supplier: Supplier) {
  const { opening_time: opens, closing_time: closes } = supplier;
  if (!opens || !closes) return 'Hours unknown';
  if (opens === closes) return 'Open 24 hours';
  const nextDay = supplier.closing_day_offset === 1 ? ' (next day)' : '';
  return `${formatTime(opens)} – ${formatTime(closes)}${nextDay}`;
}

// Supplier Service stores only a filename; the browser loads the file from
// the seed image host (the source referenced by the seed CSV's ImageURL).
const SUPPLIER_IMAGE_BASE_URL =
  process.env.NEXT_PUBLIC_SUPPLIER_IMAGE_BASE_URL ??
  'https://raw.githubusercontent.com/CS3219-AY2627S1/FoC-Template/main/data/images';

export function supplierImageSrc(supplier: Supplier) {
  return (
    supplier.image_key &&
    `${SUPPLIER_IMAGE_BASE_URL.replace(/\/+$/, '')}/${encodeURIComponent(supplier.image_key)}`
  );
}
