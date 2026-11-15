/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: implemented deterministic parsing and approved value mappings for the repository Supplier CSV.
 * Author review: Reviewed and approved by @ron.
 */
import path from "node:path";
import { parse } from "csv-parse/sync";

import {
  BUILDING_CODE_BY_SEED_ALIAS,
  BuildingCode,
} from "../../domain/buildings";
import { NewSupplier, SupplierCategory } from "../schema";
import {
  SeedSourceIdentity,
  SUPPLIER_SEED_IDENTITIES,
} from "./seed-identities";

export const EXPECTED_SEED_ROW_COUNT = SUPPLIER_SEED_IDENTITIES.length;

const CATEGORY_MAPPINGS: Readonly<
  Record<string, readonly SupplierCategory[]>
> = {
  Food: ["FOOD"],
  "Food/Coffee": ["FOOD", "COFFEE"],
  Printing: ["PRINTING"],
  Shopping: ["SHOPPING"],
};

const BUNDLED_IMAGE_NAMES = new Set([
  "ANNA.jpeg",
  "COOL_SPOT.jpeg",
  "INSTACHEF.jpeg",
  "NUS_COOP.jpeg",
  "PRINTER_COM2.jpeg",
  "ROBOT_CAFE.jpeg",
]);

interface CsvSupplierRow {
  Name: string;
  Type: string;
  Building: string;
  Floor: string;
  "Location Description": string;
  Latitude: string;
  Longitude: string;
  StartingTime: string;
  ClosingTime: string;
  ImageURL: string;
}

export interface SeedSupplier {
  supplier: NewSupplier & { id: string };
  categories: readonly SupplierCategory[];
}

export function decodeSupplierSeedCsv(csv: Uint8Array): string {
  return new TextDecoder("windows-1252", { fatal: true }).decode(csv);
}

export function parseSupplierSeedCsv(csv: string): SeedSupplier[] {
  const rows = parse(csv, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
  }) as CsvSupplierRow[];
  if (rows.length !== SUPPLIER_SEED_IDENTITIES.length) {
    throw new Error(
      `Supplier seed manifest has ${SUPPLIER_SEED_IDENTITIES.length} entries, but the CSV has ${rows.length} rows.`,
    );
  }
  const seenIds = new Set<string>();

  return rows.map((row, index) => {
    const name = requiredText(row.Name, "Name", index);
    const buildingCode = mapBuildingCode(row.Building, index);
    const sourceCategoryValue = requiredText(row.Type, "Type", index);
    const categories = mapCategories(sourceCategoryValue, index);
    const locationDescription = requiredText(
      row["Location Description"],
      "Location Description",
      index,
    );
    const floor = optionalText(row.Floor);
    const coordinates = parseCoordinates(row, index);
    const opensAt = parseSourceTime(row.StartingTime, "StartingTime", index);
    const closesAt = parseSourceTime(row.ClosingTime, "ClosingTime", index);
    const imagePath = mapImagePath(row.ImageURL, index);

    if (opensAt === closesAt) {
      throw rowError(index, "opening and closing times must differ");
    }

    const id = getManifestSeedId(index, {
      sourceCategoryValue,
      buildingCode,
      floor,
      ...coordinates,
      opensAt,
      closesAt,
      imagePath,
    });
    if (seenIds.has(id)) {
      throw rowError(index, `duplicate seed identity for ${name}`);
    }
    seenIds.add(id);

    return {
      supplier: {
        id,
        name,
        buildingCode,
        floor,
        locationDescription,
        ...coordinates,
        hoursKind: "INTERVAL",
        opensAt,
        closesAt,
        imagePath,
        status: "ACTIVE",
        version: 0,
      },
      categories,
    };
  });
}

function mapBuildingCode(value: string, index: number): BuildingCode {
  const sourceAlias = requiredText(value, "Building", index);
  const buildingCode = BUILDING_CODE_BY_SEED_ALIAS[sourceAlias];
  if (!buildingCode) {
    throw rowError(index, `unknown building alias: ${value}`);
  }

  return buildingCode;
}

function mapCategories(
  value: string,
  index: number,
): readonly SupplierCategory[] {
  const normalizedType = requiredText(value, "Type", index);
  const categories = CATEGORY_MAPPINGS[normalizedType];
  if (!categories) {
    throw rowError(index, `unknown Supplier category value: ${value}`);
  }

  return categories;
}

function parseCoordinates(
  row: CsvSupplierRow,
  index: number,
): Pick<SeedSourceIdentity, "latitude" | "longitude"> {
  const latitudeText = optionalText(row.Latitude);
  const longitudeText = optionalText(row.Longitude);

  if ((latitudeText === null) !== (longitudeText === null)) {
    throw rowError(index, "latitude and longitude must both be present or absent");
  }
  if (latitudeText === null || longitudeText === null) {
    return { latitude: null, longitude: null };
  }

  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw rowError(index, `invalid latitude: ${latitudeText}`);
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw rowError(index, `invalid longitude: ${longitudeText}`);
  }

  return { latitude: latitudeText, longitude: longitudeText };
}

function getManifestSeedId(
  index: number,
  actual: SeedSourceIdentity,
): string {
  const manifestEntry = SUPPLIER_SEED_IDENTITIES[index];
  if (!manifestEntry) {
    throw rowError(index, "has no durable identity manifest entry");
  }

  const expected = manifestEntry.expectedSourceIdentity;
  const fields = Object.keys(expected) as (keyof SeedSourceIdentity)[];
  const mismatches = fields.filter((field) => actual[field] !== expected[field]);
  if (mismatches.length > 0) {
    throw rowError(
      index,
      `source identity does not match the durable manifest (${mismatches.join(", ")}); check CSV row order/content before updating the manifest`,
    );
  }

  return manifestEntry.id;
}

function parseSourceTime(value: string, field: string, index: number): string {
  const match = /^(\d{2})(\d{2})hrs$/.exec(requiredText(value, field, index));
  if (!match) {
    throw rowError(index, `${field} must use HHMMhrs`);
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    throw rowError(index, `${field} is outside clock bounds`);
  }

  return `${match[1]}:${match[2]}`;
}

function mapImagePath(value: string, index: number): string | null {
  const imageUrl = optionalText(value);
  if (imageUrl === null) {
    return null;
  }

  let imageName: string;
  try {
    imageName = path.posix.basename(new URL(imageUrl).pathname);
  } catch {
    throw rowError(index, "ImageURL must be an absolute URL");
  }

  return BUNDLED_IMAGE_NAMES.has(imageName)
    ? `/assets/suppliers/${imageName}`
    : null;
}

function requiredText(value: string, field: string, index: number): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw rowError(index, `${field} is required`);
  }

  return trimmed;
}

function optionalText(value: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function rowError(index: number, message: string): Error {
  return new Error(`Supplier seed row ${index + 2}: ${message}`);
}
