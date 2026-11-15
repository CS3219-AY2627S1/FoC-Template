/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: implemented exact Supplier list query validation, approved defaults,
 * and the approved 300-character search bound for issue #17.
 * Author review: Reviewed and approved by @ron.
 */
import { Injectable, PipeTransform } from "@nestjs/common";

import { supplierCategory, supplierStatus } from "../../database/schema";
import { BUILDING_CODES, BuildingCode } from "../../domain/buildings";
import { supplierValidationException } from "../../http/supplier-http-errors";
import {
  SUPPLIER_LIST_DEFAULT_PAGE,
  SUPPLIER_LIST_DEFAULT_SIZE,
  SUPPLIER_LIST_MAX_SIZE,
  SUPPLIER_SORTS,
  SupplierListQuery,
  SupplierSort,
  SupplierStatus,
} from "../read/supplier-read.types";

export const SUPPLIER_LIST_MIN_SIZE = 1;
export const SUPPLIER_LIST_MAX_SEARCH_LENGTH = 300;
export const SUPPLIER_LIST_DEFAULT_SORT: SupplierSort = "name,asc";

const SUPPORTED_QUERY_KEYS = new Set([
  "q",
  "buildingCode",
  "category",
  "status",
  "page",
  "size",
  "sort",
]);

@Injectable()
export class SupplierListQueryPipe
  implements PipeTransform<Record<string, unknown>, SupplierListQuery>
{
  transform(raw: Record<string, unknown>): SupplierListQuery {
    return parseSupplierListQuery(raw);
  }
}

export function parseSupplierListQuery(
  raw: Record<string, unknown>,
): SupplierListQuery {
  const errors = new Map<string, string>();
  for (const key of Object.keys(raw)) {
    if (!SUPPORTED_QUERY_KEYS.has(key)) {
      errors.set(key, "This query parameter is not supported.");
    }
  }

  const qValue = readScalar(raw, "q", errors);
  const buildingValue = readScalar(raw, "buildingCode", errors);
  const categoryValue = readScalar(raw, "category", errors);
  const statusValue = readScalar(raw, "status", errors);
  const pageValue = readScalar(raw, "page", errors);
  const sizeValue = readScalar(raw, "size", errors);
  const sortValue = readScalar(raw, "sort", errors);

  const q = qValue?.trim() || undefined;
  if (
    q !== undefined &&
    Array.from(q).length > SUPPLIER_LIST_MAX_SEARCH_LENGTH
  ) {
    errors.set(
      "q",
      `Search must be at most ${SUPPLIER_LIST_MAX_SEARCH_LENGTH} characters.`,
    );
  }
  const buildingCode = parseControlledValue(
    buildingValue,
    BUILDING_CODES,
    "buildingCode",
    "Select a supported Building Code.",
    errors,
  );
  const category = parseControlledValue(
    categoryValue,
    supplierCategory.enumValues,
    "category",
    "Select a supported Supplier Category.",
    errors,
  );
  const status =
    parseControlledValue(
      statusValue,
      supplierStatus.enumValues,
      "status",
      "Status must be ACTIVE or ARCHIVED.",
      errors,
    ) ?? "ACTIVE";
  const page = parseInteger(
    pageValue,
    "page",
    SUPPLIER_LIST_DEFAULT_PAGE,
    0,
    Number.MAX_SAFE_INTEGER,
    errors,
  );
  const size = parseInteger(
    sizeValue,
    "size",
    SUPPLIER_LIST_DEFAULT_SIZE,
    SUPPLIER_LIST_MIN_SIZE,
    SUPPLIER_LIST_MAX_SIZE,
    errors,
  );
  const sort =
    parseControlledValue(
      sortValue,
      SUPPLIER_SORTS,
      "sort",
      "Sort must be name,asc, name,desc, or updatedAt,desc.",
      errors,
    ) ?? SUPPLIER_LIST_DEFAULT_SORT;

  if (page > Math.floor(Number.MAX_SAFE_INTEGER / size)) {
    errors.set(
      "page",
      "Page and size must produce a safe pagination offset.",
    );
  }

  if (errors.size > 0) {
    throw supplierValidationException(
      "Please correct the query parameters.",
      Object.fromEntries(errors),
    );
  }

  return {
    q,
    buildingCode: buildingCode as BuildingCode | undefined,
    category,
    status: status as SupplierStatus,
    page,
    size,
    sort,
  };
}

function readScalar(
  raw: Record<string, unknown>,
  key: string,
  errors: Map<string, string>,
): string | undefined {
  const value = raw[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    errors.set(key, "Provide this query parameter exactly once as text.");
    return undefined;
  }
  return value;
}

function parseControlledValue<const Value extends string>(
  value: string | undefined,
  allowed: readonly Value[],
  key: string,
  message: string,
  errors: Map<string, string>,
): Value | undefined {
  if (value === undefined) {
    return undefined;
  }
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) {
    errors.set(key, message);
  }
  return match;
}

function parseInteger(
  value: string | undefined,
  key: string,
  defaultValue: number,
  minimum: number,
  maximum: number,
  errors: Map<string, string>,
): number {
  if (value === undefined) {
    return defaultValue;
  }
  if (!/^\d+$/.test(value)) {
    errors.set(key, `Provide an integer from ${minimum} to ${maximum}.`);
    return defaultValue;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    errors.set(key, `Provide an integer from ${minimum} to ${maximum}.`);
    return defaultValue;
  }
  return parsed;
}
