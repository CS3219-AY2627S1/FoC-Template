/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: mapped Drizzle Supplier rows to the specified catalogue representation.
 * Author review: Reviewed and approved by @ron.
 */
import { SupplierCategory, suppliers } from "../../database/schema";
import { BUILDING_LABEL_BY_CODE } from "../../domain/buildings";
import { SupplierReadModel } from "./supplier-read.types";

export type SupplierDatabaseRow = typeof suppliers.$inferSelect;

export function mapSupplierReadModel(
  row: SupplierDatabaseRow,
  categories: readonly SupplierCategory[],
): SupplierReadModel {
  return {
    id: row.id,
    name: row.name,
    categories,
    buildingCode: row.buildingCode,
    buildingLabel: BUILDING_LABEL_BY_CODE[row.buildingCode],
    floor: row.floor,
    locationDescription: row.locationDescription,
    latitude: mapCoordinate(row.latitude),
    longitude: mapCoordinate(row.longitude),
    hoursKind: row.hoursKind,
    opensAt: mapTypicalTime(row.opensAt),
    closesAt: mapTypicalTime(row.closesAt),
    imagePath: row.imagePath,
    status: row.status,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

function mapCoordinate(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  const coordinate = Number(value);
  if (!Number.isFinite(coordinate)) {
    throw new Error("Supplier row contains a non-numeric coordinate");
  }
  return coordinate;
}

function mapTypicalTime(value: string | null): string | null {
  return value === null ? null : value.slice(0, 5);
}
