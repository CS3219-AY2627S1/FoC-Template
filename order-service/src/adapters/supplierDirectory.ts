/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: SupplierDirectory interface (the Order Service's only view of Supplier Service) and a stub
 *        with three fixed suppliers, implementing the approved plan.
 * Author review: Reviewed and approved by @mattis.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-18
 * Scope: findSupplier with four outcomes and HttpSupplierDirectory, which asks the Supplier
 *        Service's GET /api/v1/suppliers/:id with the caller's token, per the User and Supplier
 *        integration plan.
 * Author review: Reviewed and approved by @mattis.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: SupplierCatalogue.listActiveSuppliers (every page of GET /api/v1/suppliers?status=ACTIVE with
 *        the caller's token) for N2 errand extraction, per the approved N2 spec.
 * Author review: Reviewed and approved by @mattis.
 */
import type { UpstreamConfig } from "../config";
import type { SupplierSnapshot } from "../errands/errand";
import { fetchWithTimeout, readJson, UpstreamContractError, UpstreamUnavailableError } from "./upstream";

export type SupplierLookup =
  | { kind: "active"; supplier: SupplierSnapshot }
  // Supplier shows archived suppliers to administrators only
  | { kind: "archived" }
  | { kind: "unavailable" }
  | { kind: "unauthenticated" };

export interface SupplierDirectory {
  /** Looks the supplier up on behalf of the caller whose Authorization header is given. */
  findSupplier(id: string, authorization: string): Promise<SupplierLookup>;
}

/** One Supplier as N2 extraction sends it to the model. */
export interface CatalogueSupplier {
  id: string;
  name: string;
  buildingCode: string;
  /** null for the stub Suppliers, which have only a building code */
  buildingLabel: string | null;
  floor: string | null;
  locationDescription: string;
  categories: string[];
}

export type SupplierListing = { kind: "ok"; suppliers: CatalogueSupplier[] } | { kind: "unauthenticated" };

export interface SupplierCatalogue {
  /** Every ACTIVE Supplier, all pages, fetched on behalf of the caller whose Authorization header is given. */
  listActiveSuppliers(authorization: string): Promise<SupplierListing>;
}

export const STUB_SUPPLIERS: readonly SupplierSnapshot[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Coffee Bean @ COM3",
    buildingCode: "COM3",
    locationDescription: "Ground floor, beside the lift lobby",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Printers @ PC Commons",
    buildingCode: "COM1",
    locationDescription: "PC Commons, Level 2",
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    name: "PGP Foyer",
    buildingCode: "PGP",
    locationDescription: "Prince George's Park residences, main foyer",
  },
];

export class StubSupplierDirectory implements SupplierDirectory, SupplierCatalogue {
  async findSupplier(id: string, _authorization: string): Promise<SupplierLookup> {
    const supplier = STUB_SUPPLIERS.find((s) => s.id === id);
    return supplier ? { kind: "active", supplier } : { kind: "unavailable" };
  }

  async listActiveSuppliers(_authorization: string): Promise<SupplierListing> {
    return {
      kind: "ok",
      suppliers: STUB_SUPPLIERS.map((s) => ({ ...s, buildingLabel: null, floor: null, categories: [] })),
    };
  }
}

const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/**
 * Forwards the caller's Authorization header to Supplier Service GET /api/v1/suppliers/:id.
 * 404 is unavailable, 401 unauthenticated; 5xx, timeout or network error throws
 * UpstreamUnavailableError (503); any other status or an unexpected body throws
 * UpstreamContractError (500).
 */
export class HttpSupplierDirectory implements SupplierDirectory, SupplierCatalogue {
  constructor(private readonly config: UpstreamConfig, private readonly fetchImpl: typeof fetch = globalThis.fetch) {}

  async findSupplier(id: string, authorization: string): Promise<SupplierLookup> {
    // Callers pass a validated uuid, so the id needs no escaping
    const url = new URL(`/api/v1/suppliers/${id}`, this.config.baseUrl);
    const res = await fetchWithTimeout(this.fetchImpl, url, { headers: { authorization } }, this.config.timeoutMs, "supplier");
    if (res.status === 404) return { kind: "unavailable" };
    if (res.status === 401) return { kind: "unauthenticated" };
    if (res.status >= 500) throw new UpstreamUnavailableError("supplier", `status ${res.status}`);
    if (res.status !== 200) throw new UpstreamContractError("supplier", `status ${res.status}`);
    const b = (await readJson(res, "supplier")) as Record<string, unknown> | null;
    if (
      !nonEmpty(b?.id) || !nonEmpty(b.name) || !nonEmpty(b.buildingCode) || !nonEmpty(b.locationDescription) ||
      (b.status !== "ACTIVE" && b.status !== "ARCHIVED")
    ) {
      throw new UpstreamContractError("supplier", "supplier body is missing a field or has an unknown status");
    }
    if (b.status === "ARCHIVED") return { kind: "archived" };
    return {
      kind: "active",
      supplier: { id: b.id, name: b.name, buildingCode: b.buildingCode, locationDescription: b.locationDescription },
    };
  }

  /**
   * GET /api/v1/suppliers?status=ACTIVE, 100 per page, until the last page, with the caller's token.
   * Same mapping as findSupplier, per page: 401 is unauthenticated; 5xx, timeout or network error throws
   * UpstreamUnavailableError (503); any other status or an unexpected body throws UpstreamContractError (500).
   */
  async listActiveSuppliers(authorization: string): Promise<SupplierListing> {
    const suppliers: CatalogueSupplier[] = [];
    for (let page = 0; ; page++) {
      const url = new URL("/api/v1/suppliers", this.config.baseUrl);
      url.searchParams.set("status", "ACTIVE");
      url.searchParams.set("page", String(page));
      url.searchParams.set("size", String(LIST_PAGE_SIZE));
      const res = await fetchWithTimeout(this.fetchImpl, url, { headers: { authorization } }, this.config.timeoutMs, "supplier");
      if (res.status === 401) return { kind: "unauthenticated" };
      if (res.status >= 500) throw new UpstreamUnavailableError("supplier", `status ${res.status}`);
      if (res.status !== 200) throw new UpstreamContractError("supplier", `status ${res.status}`);
      const b = (await readJson(res, "supplier")) as Record<string, unknown> | null;
      const totalPages = b?.totalPages;
      if (!Array.isArray(b?.items) || typeof totalPages !== "number" || !Number.isInteger(totalPages) || totalPages < 0) {
        throw new UpstreamContractError("supplier", "supplier list body is missing items or totalPages");
      }
      for (const item of b.items) suppliers.push(catalogueSupplier(item));
      if (page + 1 >= totalPages) return { kind: "ok", suppliers };
    }
  }
}

const LIST_PAGE_SIZE = 100; // Supplier Service's maximum page size

const nullableString = (v: unknown): v is string | null | undefined => v === undefined || v === null || typeof v === "string";

function catalogueSupplier(raw: unknown): CatalogueSupplier {
  const b = raw as Record<string, unknown> | null;
  if (
    !nonEmpty(b?.id) || !nonEmpty(b.name) || !nonEmpty(b.buildingCode) || !nonEmpty(b.locationDescription) ||
    !nullableString(b.buildingLabel) || !nullableString(b.floor) ||
    !Array.isArray(b.categories) || !b.categories.every((c) => typeof c === "string")
  ) {
    throw new UpstreamContractError("supplier", "supplier list item is missing a field");
  }
  return {
    id: b.id,
    name: b.name,
    buildingCode: b.buildingCode,
    buildingLabel: b.buildingLabel ?? null,
    floor: b.floor ?? null,
    locationDescription: b.locationDescription,
    categories: b.categories as string[],
  };
}
