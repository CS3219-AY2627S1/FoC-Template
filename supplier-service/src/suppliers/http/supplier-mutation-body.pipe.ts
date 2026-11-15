/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-26.
 * Scope: implemented the author-approved strict create/full-update Supplier
 * body validation and normalization contract for issue #20.
 * Author review: Reviewed and approved by @ron.
 */
import { Injectable, PipeTransform } from "@nestjs/common";

import {
  hoursKind as supplierHoursKind,
  SupplierCategory,
  supplierCategory,
} from "../../database/schema";
import { BUILDING_CODES, BuildingCode } from "../../domain/buildings";
import { supplierValidationException } from "../../http/supplier-http-errors";
import { SupplierMutationValues } from "../supplier-mutation.values";

export const SUPPLIER_NAME_MAX_LENGTH = 120;
export const SUPPLIER_FLOOR_MAX_LENGTH = 20;
export const SUPPLIER_LOCATION_DESCRIPTION_MAX_LENGTH = 300;

const SUPPORTED_BODY_KEYS = new Set([
  "name",
  "categories",
  "buildingCode",
  "floor",
  "locationDescription",
  "latitude",
  "longitude",
  "hoursKind",
  "opensAt",
  "closesAt",
]);

type SupplierHoursKind = (typeof supplierHoursKind.enumValues)[number];

@Injectable()
export class SupplierMutationBodyPipe
  implements PipeTransform<unknown, SupplierMutationValues>
{
  transform(raw: unknown): SupplierMutationValues {
    return parseSupplierMutationBody(raw);
  }
}

export function parseSupplierMutationBody(
  raw: unknown,
): SupplierMutationValues {
  if (!isRecord(raw)) {
    throw supplierValidationException("Please correct the Supplier details.", {
      body: "Provide a JSON object containing the Supplier details.",
    });
  }

  const errors = new Map<string, string>();
  for (const key of Object.keys(raw)) {
    if (!SUPPORTED_BODY_KEYS.has(key)) {
      errors.set(key, "This field is not supported.");
    }
  }

  const name = parseRequiredText(
    raw.name,
    "name",
    "Name",
    SUPPLIER_NAME_MAX_LENGTH,
    errors,
  );
  const categories = parseCategories(raw.categories, errors);
  const buildingCode = parseBuildingCode(raw.buildingCode, errors);
  const floor = parseOptionalText(
    raw.floor,
    "floor",
    "Floor",
    SUPPLIER_FLOOR_MAX_LENGTH,
    errors,
  );
  const locationDescription = parseRequiredText(
    raw.locationDescription,
    "locationDescription",
    "Location Description",
    SUPPLIER_LOCATION_DESCRIPTION_MAX_LENGTH,
    errors,
  );
  const { latitude, longitude } = parseCoordinates(raw, errors);
  const { hoursKind, opensAt, closesAt } = parseHours(raw, errors);

  if (errors.size > 0) {
    throw supplierValidationException(
      "Please correct the Supplier details.",
      Object.fromEntries(errors),
    );
  }

  return {
    name: name as string,
    categories: categories as SupplierCategory[],
    buildingCode: buildingCode as BuildingCode,
    floor,
    locationDescription: locationDescription as string,
    latitude,
    longitude,
    hoursKind: hoursKind as SupplierHoursKind,
    opensAt,
    closesAt,
  };
}

function parseRequiredText(
  value: unknown,
  key: string,
  label: string,
  maximumLength: number,
  errors: Map<string, string>,
): string | undefined {
  if (typeof value !== "string") {
    errors.set(key, `${label} is required and must be text.`);
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    errors.set(key, `${label} is required.`);
    return undefined;
  }
  if (unicodeLength(trimmed) > maximumLength) {
    errors.set(key, `${label} must be at most ${maximumLength} characters.`);
    return undefined;
  }
  return trimmed;
}

function parseOptionalText(
  value: unknown,
  key: string,
  label: string,
  maximumLength: number,
  errors: Map<string, string>,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    errors.set(key, `${label} must be text or null.`);
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (unicodeLength(trimmed) > maximumLength) {
    errors.set(key, `${label} must be at most ${maximumLength} characters.`);
    return null;
  }
  return trimmed;
}

function parseCategories(
  value: unknown,
  errors: Map<string, string>,
): SupplierCategory[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    errors.set("categories", "Select at least one Supplier Category.");
    return undefined;
  }

  const categories: SupplierCategory[] = [];
  for (const candidate of value) {
    if (typeof candidate !== "string") {
      errors.set(
        "categories",
        "Each category must be a supported Supplier Category.",
      );
      return undefined;
    }

    const trimmed = candidate.trim();
    const category = supplierCategory.enumValues.find(
      (allowed) => allowed === trimmed,
    );
    if (!category) {
      errors.set(
        "categories",
        "Each category must be a supported Supplier Category.",
      );
      return undefined;
    }
    categories.push(category);
  }

  if (new Set(categories).size !== categories.length) {
    errors.set("categories", "Select each Supplier Category only once.");
    return undefined;
  }
  return categories;
}

function parseBuildingCode(
  value: unknown,
  errors: Map<string, string>,
): BuildingCode | undefined {
  if (typeof value !== "string") {
    errors.set("buildingCode", "Select a supported Building Code.");
    return undefined;
  }

  const trimmed = value.trim();
  const buildingCode = BUILDING_CODES.find((allowed) => allowed === trimmed);
  if (!buildingCode) {
    errors.set("buildingCode", "Select a supported Building Code.");
    return undefined;
  }
  return buildingCode;
}

function parseCoordinates(
  raw: Record<string, unknown>,
  errors: Map<string, string>,
): Pick<SupplierMutationValues, "latitude" | "longitude"> {
  const latitudePresent = raw.latitude !== undefined && raw.latitude !== null;
  const longitudePresent = raw.longitude !== undefined && raw.longitude !== null;

  const latitude = parseCoordinate(
    raw.latitude,
    "latitude",
    "Latitude",
    -90,
    90,
    errors,
  );
  const longitude = parseCoordinate(
    raw.longitude,
    "longitude",
    "Longitude",
    -180,
    180,
    errors,
  );

  if (latitudePresent !== longitudePresent) {
    const message = "Latitude and longitude must be provided together.";
    if (!errors.has("latitude")) {
      errors.set("latitude", message);
    }
    if (!errors.has("longitude")) {
      errors.set("longitude", message);
    }
  }

  return { latitude, longitude };
}

function parseCoordinate(
  value: unknown,
  key: "latitude" | "longitude",
  label: string,
  minimum: number,
  maximum: number,
  errors: Map<string, string>,
): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    errors.set(
      key,
      `${label} must be a number from ${minimum} to ${maximum}.`,
    );
    return null;
  }
  return value;
}

function parseHours(
  raw: Record<string, unknown>,
  errors: Map<string, string>,
): {
  hoursKind: SupplierHoursKind | undefined;
  opensAt: string | null;
  closesAt: string | null;
} {
  const hoursKind = parseHoursKind(raw.hoursKind, errors);
  if (hoursKind === "INTERVAL") {
    const opensAt = parseRequiredTime(
      raw.opensAt,
      "opensAt",
      "Opening time",
      errors,
    );
    const closesAt = parseRequiredTime(
      raw.closesAt,
      "closesAt",
      "Closing time",
      errors,
    );
    if (opensAt !== undefined && closesAt !== undefined && opensAt === closesAt) {
      errors.set("closesAt", "Closing time must differ from opening time.");
    }
    return {
      hoursKind,
      opensAt: opensAt ?? null,
      closesAt: closesAt ?? null,
    };
  }

  if (hoursKind === "UNKNOWN" || hoursKind === "ALL_DAY") {
    if (raw.opensAt !== undefined) {
      errors.set("opensAt", `${hoursKind} Suppliers must omit opening time.`);
    }
    if (raw.closesAt !== undefined) {
      errors.set("closesAt", `${hoursKind} Suppliers must omit closing time.`);
    }
  }
  return { hoursKind, opensAt: null, closesAt: null };
}

function parseHoursKind(
  value: unknown,
  errors: Map<string, string>,
): SupplierHoursKind | undefined {
  if (typeof value !== "string") {
    errors.set(
      "hoursKind",
      "Hours Kind must be UNKNOWN, ALL_DAY, or INTERVAL.",
    );
    return undefined;
  }

  const trimmed = value.trim();
  const matched = supplierHoursKind.enumValues.find(
    (allowed) => allowed === trimmed,
  );
  if (!matched) {
    errors.set(
      "hoursKind",
      "Hours Kind must be UNKNOWN, ALL_DAY, or INTERVAL.",
    );
  }
  return matched;
}

function parseRequiredTime(
  value: unknown,
  key: "opensAt" | "closesAt",
  label: string,
  errors: Map<string, string>,
): string | undefined {
  if (typeof value !== "string") {
    errors.set(key, `${label} is required for interval hours in HH:mm format.`);
    return undefined;
  }

  const trimmed = value.trim();
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(trimmed)) {
    errors.set(key, `${label} must use 24-hour HH:mm format.`);
    return undefined;
  }
  return trimmed;
}

function unicodeLength(value: string): number {
  return Array.from(value).length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
