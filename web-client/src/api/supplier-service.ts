/*
 * AI Assistance Disclosure (hwangjihun):
 * Tool: ChatGPT (Codex, model: gpt-6-sol), date: 2026-09-24
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-02
 * Scope: Implemented the Supplier HTTP client and refined filters and error handling.
 * Author review: I validated correctness, and added boundary checks.
 */

import { ApiRequestError, type FieldError } from "./client";

export type SupplierStatus = "ACTIVE" | "INACTIVE";

export type Category = {
  code: string;
  display_name: string;
};

export type SupplierListItem = {
  id: string;
  name: string;
  categories: string[];
  building_area: string;
  floor: string | null;
  status: SupplierStatus;
  opening_time: string | null;
  closing_time: string | null;
};

export type Supplier = SupplierListItem & {
  pickup_location_description: string;
  latitude: number | null;
  longitude: number | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
};

export type SupplierList = {
  items: SupplierListItem[];
  page: number;
  page_size: number;
  total: number;
};

export type SupplierQuery = {
  q?: string;
  categories?: string[];
  sort?: "asc" | "desc";
  status?: SupplierStatus;
  page?: number;
  pageSize?: number;
};

export type SupplierInput = {
  name: string;
  categories: string[];
  building_area: string;
  pickup_location_description: string;
  floor?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  opening_time?: string | null;
  closing_time?: string | null;
  image_url?: string | null;
  status?: SupplierStatus;
};

type SupplierErrorBody = {
  error?: {
    code?: string;
    message?: string;
    fields?: Array<{ field: string; message: string }>;
  };
};

function queryString(query: SupplierQuery): string {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set("q", query.q.trim());
  for (const code of query.categories ?? []) params.append("category", code);
  if (query.sort) params.set("sort", query.sort);
  if (query.status) params.set("status", query.status);
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("page_size", String(query.pageSize));
  return params.size ? `?${params}` : "";
}

// A stalled gateway or service should end in a retryable error, not an endless loading state.
export const supplierRequestTimeoutMs = 10_000;

async function supplierRequest<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${token}`);
  if (options.body) headers.set("Content-Type", "application/json");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), supplierRequestTimeoutMs);
  let response: Response;
  let body: (T & SupplierErrorBody) | undefined;
  try {
    response = await fetch(`/api/v1${path}`, { ...options, headers, credentials: "same-origin", signal: controller.signal });
    body = response.headers.get("content-type")?.includes("application/json")
      ? await response.json() as T & SupplierErrorBody
      : undefined;
  } catch (failure) {
    if (controller.signal.aborted) {
      throw new ApiRequestError(0, "Supplier Service took too long to respond. Try again.", { code: "TIMEOUT" });
    }
    if (failure instanceof SyntaxError) {
      throw new ApiRequestError(502, "Supplier Service sent an unreadable response. Try again.", { code: "BAD_RESPONSE" });
    }
    throw new ApiRequestError(0, "Check your connection and try again.", { code: "NETWORK_ERROR" });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const error = body?.error;
    const fieldErrors: FieldError[] = (error?.fields ?? []).map((field) => ({ ...field, code: error?.code ?? "VALIDATION_ERROR" }));
    const fallback = response.status >= 500
      ? "Supplier Service is unavailable right now. Try again in a moment."
      : "Supplier Service could not complete this request.";
    throw new ApiRequestError(response.status, error?.message ?? fallback, {
      code: error?.code,
      fieldErrors,
    });
  }
  if (response.status !== 204 && body === undefined) {
    // A 2xx HTML page usually means a proxy served the SPA instead of the API.
    throw new ApiRequestError(502, "Supplier Service sent an unreadable response. Try again.", { code: "BAD_RESPONSE" });
  }
  return body as T;
}

export const supplierService = {
  categories: (token: string) => supplierRequest<Category[]>("/categories", token),
  list: (query: SupplierQuery, token: string, admin = false) =>
    supplierRequest<SupplierList>(`${admin ? "/admin" : ""}/suppliers${queryString(query)}`, token),
  detail: (id: string, token: string, admin = false) =>
    supplierRequest<Supplier>(`${admin ? "/admin" : ""}/suppliers/${encodeURIComponent(id)}`, token),
  create: (input: SupplierInput, token: string) =>
    supplierRequest<Supplier>("/admin/suppliers", token, { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, changes: Partial<SupplierInput>, token: string) =>
    supplierRequest<Supplier>(`/admin/suppliers/${encodeURIComponent(id)}`, token, {
      method: "PATCH", body: JSON.stringify(changes),
    }),
  deactivate: (id: string, token: string) =>
    supplierRequest<{ id: string; outcome: "DEACTIVATED" }>(`/admin/suppliers/${encodeURIComponent(id)}`, token, {
      method: "DELETE",
    }),
};
