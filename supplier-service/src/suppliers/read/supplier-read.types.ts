/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: defined the Supplier catalogue read inputs and API-ready representations from the approved specification.
 * Author review: Reviewed and approved by @ron.
 */
import { SupplierCategory, supplierStatus } from "../../database/schema";
import { BuildingCode } from "../../domain/buildings";

export const SUPPLIER_LIST_DEFAULT_PAGE = 0;
export const SUPPLIER_LIST_DEFAULT_SIZE = 12;
export const SUPPLIER_LIST_MAX_SIZE = 100;

export const SUPPLIER_SORTS = [
  "name,asc",
  "name,desc",
  "updatedAt,desc",
] as const;

export type SupplierSort = (typeof SUPPLIER_SORTS)[number];
export type SupplierStatus = (typeof supplierStatus.enumValues)[number];

export interface SupplierListQuery {
  readonly q?: string;
  readonly buildingCode?: BuildingCode;
  readonly category?: SupplierCategory;
  readonly status: SupplierStatus;
  readonly page: number;
  readonly size: number;
  readonly sort: SupplierSort;
}

export interface SupplierReadModel {
  readonly id: string;
  readonly name: string;
  readonly categories: readonly SupplierCategory[];
  readonly buildingCode: BuildingCode;
  readonly buildingLabel: string;
  readonly floor: string | null;
  readonly locationDescription: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly hoursKind: "UNKNOWN" | "ALL_DAY" | "INTERVAL";
  readonly opensAt: string | null;
  readonly closesAt: string | null;
  readonly imagePath: string | null;
  readonly status: SupplierStatus;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
}

export interface SupplierListPage {
  readonly items: readonly SupplierReadModel[];
  readonly page: number;
  readonly size: number;
  readonly totalItems: number;
  readonly totalPages: number;
}
