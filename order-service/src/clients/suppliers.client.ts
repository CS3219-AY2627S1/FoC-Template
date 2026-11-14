/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-23
 * Scope (2026-10-23): Existence checks for create/edit (George, 2026-10-23: call
 *        supplier-service synchronously with the caller's token; outage = 503). Supplier via
 *        GET /api/v1/suppliers/:id (inactive or deleted suppliers are 404 there); location
 *        via membership in GET /api/v1/suppliers/reference/location. The 3 s timeout is by
 *        convention and flagged for review.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Scope (2026-11-09, Claude Code, model: claude-sonnet-5): Stage 28 c2 - added the
 *        Supplier-Order-Service-Key path for the scheduled-errands worker
 *        (`supplierStatusForWorker` / `locationExistsForWorker`), reusing the same two GET
 *        endpoints and their status-code mapping. The worker's call carries no user token, so
 *        these are new methods rather than an overload of `supplierExists` / `locationExists`,
 *        which keep their existing signature, return type and Authorization-header behaviour
 *        for createOrder/editOrder, untouched. No requirements, architecture, schema, or API
 *        decisions were made by the AI tool.
 * Author review:
 */
import { computeSupplierOpenStatus, type OpeningHour } from './openingHours.js';

/** `unavailable`: supplier-service could not answer (down, timeout, 5xx, 429, auth). */
export type Existence = 'found' | 'not_found' | 'unavailable';

export interface SupplierWorkerCheck {
  existence: Existence;
  /** True only when `existence` is 'found' and the supplier has no opening-hours rows at all. */
  hasNoOpeningHours: boolean;
  /** Meaningful only when `existence` is 'found' and `hasNoOpeningHours` is false. */
  closed: boolean;
  nextOpeningAt: Date | null;
}

export interface SuppliersClient {
  /** `authorization` is the caller's own `Bearer …` header, passed through. */
  supplierExists(supplierId: number, authorization: string): Promise<Existence>;
  locationExists(locationId: number, authorization: string): Promise<Existence>;
  /** Service-key path for the scheduled-errands worker's fire-time check (Stage 28 c2/f). */
  supplierStatusForWorker(supplierId: number, now: Date): Promise<SupplierWorkerCheck>;
  locationExistsForWorker(locationId: number): Promise<Existence>;
}

type FetchLike = typeof fetch;

export const SUPPLIER_CALL_TIMEOUT_MS = 3_000;

export function createHttpSuppliersClient(
  baseUrl: string,
  fetchImpl: FetchLike = fetch,
  timeoutMs: number = SUPPLIER_CALL_TIMEOUT_MS,
  serviceKey?: string,
): SuppliersClient {
  async function get(path: string, headers: Record<string, string>) {
    try {
      return await fetchImpl(new URL(path, baseUrl), {
        headers: { ...headers, accept: 'application/json' },
        // In the request path, so bounded: a hung supplier-service must not hang POST /orders.
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return null; // refused / reset / DNS / timeout
    }
  }

  function serviceKeyHeaders(): Record<string, string> {
    if (serviceKey === undefined) {
      throw new Error('SUPPLIER_ORDER_SERVICE_API_KEY is not configured');
    }
    return { 'supplier-order-service-key': serviceKey };
  }

  async function existenceOf(path: string, headers: Record<string, string>): Promise<Existence> {
    const res = await get(path, headers);
    if (!res) return 'unavailable';
    if (res.ok) return 'found';
    return res.status === 404 ? 'not_found' : 'unavailable';
  }

  async function locationMembership(locationId: number, headers: Record<string, string>): Promise<Existence> {
    const res = await get('/api/v1/suppliers/reference/location', headers);
    if (!res?.ok) return 'unavailable';
    try {
      const body = (await res.json()) as { locations?: { location_id?: unknown }[] };
      if (!Array.isArray(body?.locations)) return 'unavailable';
      return body.locations.some((l) => l?.location_id === locationId) ? 'found' : 'not_found';
    } catch {
      return 'unavailable'; // not the expected JSON
    }
  }

  return {
    async supplierExists(supplierId, authorization) {
      return existenceOf(`/api/v1/suppliers/${supplierId}`, { authorization });
    },

    async locationExists(locationId, authorization) {
      return locationMembership(locationId, { authorization });
    },

    async supplierStatusForWorker(supplierId, now) {
      const res = await get(`/api/v1/suppliers/${supplierId}`, serviceKeyHeaders());
      if (!res) return { existence: 'unavailable', hasNoOpeningHours: false, closed: false, nextOpeningAt: null };
      if (!res.ok) {
        const existence = res.status === 404 ? 'not_found' : 'unavailable';
        return { existence, hasNoOpeningHours: false, closed: false, nextOpeningAt: null };
      }
      try {
        const body = (await res.json()) as { openingHours?: OpeningHour[] };
        const hours = Array.isArray(body?.openingHours) ? body.openingHours : [];
        if (hours.length === 0) {
          return { existence: 'found', hasNoOpeningHours: true, closed: true, nextOpeningAt: null };
        }
        const { closed, nextOpeningAt } = computeSupplierOpenStatus(hours, now);
        return { existence: 'found', hasNoOpeningHours: false, closed, nextOpeningAt };
      } catch {
        return { existence: 'unavailable', hasNoOpeningHours: false, closed: false, nextOpeningAt: null };
      }
    },

    async locationExistsForWorker(locationId) {
      return locationMembership(locationId, serviceKeyHeaders());
    },
  };
}

/** Unit tests only: every id exists, nothing is closed. */
export function createStubSuppliersClient(): SuppliersClient {
  return {
    async supplierExists() {
      return 'found';
    },
    async locationExists() {
      return 'found';
    },
    async supplierStatusForWorker() {
      return { existence: 'found', hasNoOpeningHours: false, closed: false, nextOpeningAt: null };
    },
    async locationExistsForWorker() {
      return 'found';
    },
  };
}
