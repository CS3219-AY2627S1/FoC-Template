/**
 * Server-side client for Supplier Service's public reads. Only import this
 * from Server Actions, Route Handlers or Server Components: Supplier Service
 * is only reachable on the Compose network and does not allow browser origins.
 */

const BASE_URL = process.env.SUPPLIER_SERVICE_URL ?? 'http://localhost:8081';
const TIMEOUT_MS = 5000;

export type Category = {
  id: string;
  name: string;
};

export type Supplier = {
  id: string;
  name: string;
  area: string;
  location: { latitude: number; longitude: number };
  categories: Category[];
  description: string | null;
  building: string | null;
  floor: string | null;
  /** Filename under `public/images/suppliers/`, e.g. `ANNA.jpeg`. */
  image_key: string | null;
  /** Asia/Singapore wall-clock `HH:MM:SS`; both null means hours unknown. */
  opening_time: string | null;
  closing_time: string | null;
  /** 1 when closing time falls on the next day; equal times mean 24 hours. */
  closing_day_offset: 0 | 1 | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
};

export type SupplierPage = {
  items: Supplier[];
  total: number;
  limit: number;
  offset: number;
};

export type SupplierFilters = {
  area?: string;
  categoryIds?: string[];
  limit?: number;
  offset?: number;
};

/** Supplier Service caps a page at 100 items. */
export const MAX_PAGE_SIZE = 100;

export class SupplierServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SupplierServiceError';
  }
}

/** Every Supplier Service error is `{error: {code, message, details?}}`. */
function parseError(status: number, body: unknown): SupplierServiceError {
  const error = (body as { error?: { code?: unknown; message?: unknown } })
    ?.error;
  return new SupplierServiceError(
    status,
    typeof error?.code === 'string' ? error.code : 'UNKNOWN_ERROR',
    typeof error?.message === 'string'
      ? error.message
      : 'Supplier Service request failed.',
  );
}

async function request<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new SupplierServiceError(
      503,
      'SERVICE_UNAVAILABLE',
      'Supplier details are temporarily unavailable.',
    );
  }

  const data: unknown = await response.json().catch(() => undefined);
  if (!response.ok) throw parseError(response.status, data);
  // A stalled or non-JSON success body is a service failure, not data.
  if (data === undefined) {
    throw new SupplierServiceError(
      502,
      'INVALID_RESPONSE',
      'Supplier details are temporarily unavailable.',
    );
  }
  return data as T;
}

export const supplierService = {
  /** Active suppliers ordered by name; categories match any of the IDs. */
  listSuppliers: ({
    area,
    categoryIds = [],
    limit,
    offset,
  }: SupplierFilters) => {
    const params = new URLSearchParams();
    if (area) params.set('area', area);
    for (const id of categoryIds) params.append('category_id', id);
    if (limit !== undefined) params.set('limit', String(limit));
    if (offset !== undefined) params.set('offset', String(offset));
    const query = params.toString();
    return request<SupplierPage>(`/suppliers${query && `?${query}`}`);
  },

  /** An active supplier, or null when it does not exist or was deleted. */
  getSupplier: async (id: string) => {
    try {
      return await request<Supplier>(`/suppliers/${encodeURIComponent(id)}`);
    } catch (error) {
      // A malformed UUID fails path validation (422) rather than 404.
      if (
        error instanceof SupplierServiceError &&
        (error.status === 404 || error.status === 422)
      ) {
        return null;
      }
      throw error;
    }
  },

  listCategories: () => request<Category[]>('/categories'),

  listAreas: () => request<string[]>('/areas'),
};
