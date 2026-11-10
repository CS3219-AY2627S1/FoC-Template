/* AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-11-09.
 * Scope: Own-user history query and date/pagination validation for issue #58.
 * Author review: Reviewed and approved by @phuc. */
import type { Pool } from "pg";
import { toAmount } from "./db";

export class InvalidTransactionQuery extends Error {}

export interface TransactionQuery {
  from?: string;
  to?: string;
  page: number;
  size: number;
}

function timestamp(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) throw new InvalidTransactionQuery("Dates must be ISO timestamps with a timezone.");
  const [, year, month, day, hour, minute, second, zone] = match;
  const y = Number(year);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][Number(month) - 1];
  if (y < 1 || Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > days ||
      Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 ||
      (zone !== "Z" && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59))) {
    throw new InvalidTransactionQuery("Invalid calendar date or timezone.");
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new InvalidTransactionQuery("Invalid timestamp.");
  return date.toISOString();
}

export function parseTransactionQuery(params: URLSearchParams): TransactionQuery {
  for (const key of params.keys()) {
    if (!["from", "to", "page", "size"].includes(key) || params.getAll(key).length !== 1) {
      throw new InvalidTransactionQuery("Only single from, to, page and size parameters are accepted.");
    }
  }
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const value = params.get(key);
    if (value === null) return fallback;
    const number = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < min || number > max) {
      throw new InvalidTransactionQuery(`Invalid ${key}.`);
    }
    return number;
  };
  const page = integer("page", 0, 0, Number.MAX_SAFE_INTEGER);
  const size = integer("size", 20, 1, 100);
  if (!Number.isSafeInteger(page * size)) throw new InvalidTransactionQuery("Page offset is too large.");
  const from = params.has("from") ? timestamp(params.get("from")!) : undefined;
  const to = params.has("to") ? timestamp(params.get("to")!) : undefined;
  if (from && to && Date.parse(from) >= Date.parse(to)) throw new InvalidTransactionQuery("from must be before to.");
  return { from, to, page, size };
}

export interface CreditTransaction {
  id: string;
  type: "INITIAL_GRANT" | "RESERVE" | "CAPTURE_DEBIT" | "CAPTURE_CREDIT" | "RELEASE" | "FORFEIT";
  availableDelta: number;
  reservedDelta: number;
  reservationId: string | null;
  orderId: string | null;
  createdAt: string;
}

export interface TransactionPage {
  items: CreditTransaction[];
  page: number;
  size: number;
  totalItems: number;
}

export async function listTransactions(pool: Pool, userId: string, query: TransactionQuery): Promise<TransactionPage> {
  // One statement gives the count and rows the same snapshot, even for an empty page.
  const result = await pool.query(`
    WITH filtered AS NOT MATERIALIZED (
      SELECT * FROM credit_transactions
      WHERE user_id = $1 AND ($2::timestamptz IS NULL OR created_at >= $2)
        AND ($3::timestamptz IS NULL OR created_at < $3)
    ), page_rows AS (
      SELECT * FROM filtered ORDER BY created_at DESC, id DESC LIMIT $4 OFFSET $5
    )
    SELECT (SELECT count(*)::text FROM filtered) AS total,
      COALESCE((SELECT json_agg(json_build_object(
        'id', id::text, 'type', type, 'availableDelta', available_delta::text,
        'reservedDelta', reserved_delta::text, 'reservationId', reservation_id,
        'orderId', order_id, 'createdAt', created_at
      ) ORDER BY created_at DESC, id DESC) FROM page_rows), '[]'::json) AS items
  `, [userId, query.from ?? null, query.to ?? null, query.size, query.page * query.size]);
  const row = result.rows[0];
  return {
    items: row.items.map((item: Omit<CreditTransaction, "availableDelta" | "reservedDelta"> & { availableDelta: string; reservedDelta: string }) => ({
      ...item,
      availableDelta: toAmount(item.availableDelta),
      reservedDelta: toAmount(item.reservedDelta),
      createdAt: new Date(item.createdAt).toISOString(),
    })),
    page: query.page, size: query.size, totalItems: toAmount(row.total),
  };
}
