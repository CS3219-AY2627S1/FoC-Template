/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-26.
 * Scope: implemented parameterized Drizzle queries for race-safe duplicate
 * detection and atomic Supplier mutations, including an explicit PostgreSQL
 * text cast found necessary by the live issue #23 concurrency check.
 * Author review: Reviewed and approved by @ron.
 */
import { and, asc, eq, sql, SQL, SQLWrapper } from "drizzle-orm";
import { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import { PgDatabase } from "drizzle-orm/pg-core";

import * as schema from "../../database/schema";
import {
  supplierCategories,
  suppliers,
} from "../../database/schema";
import { SupplierMutationValues } from "../supplier-mutation.values";

export type SupplierMutationDatabase = PgDatabase<
  NodePgQueryResultHKT,
  typeof schema
>;

export function buildDuplicateIdentityLockQuery(
  database: SupplierMutationDatabase,
  values: SupplierMutationValues,
) {
  const identity = normalizedIdentity(values);

  return database.select({
    lock: sql`
      pg_advisory_xact_lock(
        hashtextextended(
          jsonb_build_array(
            ${identity.name},
            ${values.buildingCode}::text,
            ${identity.floor},
            ${identity.locationDescription}
          )::text,
          0
        )
      )
    `.as("lock"),
  }).from(sql`(select 1) as duplicate_lock_source`);
}

export function buildDuplicateSupplierQuery(
  database: SupplierMutationDatabase,
  values: SupplierMutationValues,
) {
  const storedIdentity = normalizedIdentity({
    name: suppliers.name,
    floor: suppliers.floor,
    locationDescription: suppliers.locationDescription,
  });
  const requestedIdentity = normalizedIdentity(values);

  return database
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(
      and(
        eq(storedIdentity.name, requestedIdentity.name),
        eq(suppliers.buildingCode, values.buildingCode),
        eq(storedIdentity.floor, requestedIdentity.floor),
        eq(
          storedIdentity.locationDescription,
          requestedIdentity.locationDescription,
        ),
      ),
    )
    .limit(1);
}

export function buildSupplierInsertQuery(
  database: SupplierMutationDatabase,
  values: SupplierMutationValues,
) {
  return database
    .insert(suppliers)
    .values({
      name: values.name,
      buildingCode: values.buildingCode,
      floor: values.floor,
      locationDescription: values.locationDescription,
      latitude: mapCoordinate(values.latitude),
      longitude: mapCoordinate(values.longitude),
      hoursKind: values.hoursKind,
      opensAt: values.opensAt,
      closesAt: values.closesAt,
      imagePath: null,
      status: "ACTIVE",
      version: 0,
      archivedAt: null,
    })
    .returning();
}

export function buildSupplierLockQuery(
  database: SupplierMutationDatabase,
  supplierId: string,
) {
  return database
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .limit(1)
    .for("update");
}

export function buildSupplierUpdateQuery(
  database: SupplierMutationDatabase,
  supplierId: string,
  expectedVersion: number,
  expectedStatus: "ACTIVE" | "ARCHIVED",
  values: SupplierMutationValues,
) {
  return database
    .update(suppliers)
    .set({
      name: values.name,
      buildingCode: values.buildingCode,
      floor: values.floor,
      locationDescription: values.locationDescription,
      latitude: mapCoordinate(values.latitude),
      longitude: mapCoordinate(values.longitude),
      hoursKind: values.hoursKind,
      opensAt: values.opensAt,
      closesAt: values.closesAt,
      version: sql`${suppliers.version} + 1`,
      updatedAt: sql`current_timestamp`,
    })
    .where(
      and(
        eq(suppliers.id, supplierId),
        eq(suppliers.version, expectedVersion),
        eq(suppliers.status, expectedStatus),
      ),
    )
    .returning();
}

export function buildSupplierArchiveQuery(
  database: SupplierMutationDatabase,
  supplierId: string,
  expectedVersion: number,
) {
  return database
    .update(suppliers)
    .set({
      status: "ARCHIVED",
      archivedAt: sql`current_timestamp`,
      updatedAt: sql`current_timestamp`,
      version: sql`${suppliers.version} + 1`,
    })
    .where(
      and(
        eq(suppliers.id, supplierId),
        eq(suppliers.version, expectedVersion),
        eq(suppliers.status, "ACTIVE"),
      ),
    )
    .returning();
}

export function buildSupplierRestoreQuery(
  database: SupplierMutationDatabase,
  supplierId: string,
  expectedVersion: number,
) {
  return database
    .update(suppliers)
    .set({
      status: "ACTIVE",
      archivedAt: null,
      updatedAt: sql`current_timestamp`,
      version: sql`${suppliers.version} + 1`,
    })
    .where(
      and(
        eq(suppliers.id, supplierId),
        eq(suppliers.version, expectedVersion),
        eq(suppliers.status, "ARCHIVED"),
      ),
    )
    .returning();
}

export function buildSupplierCategoriesDeleteQuery(
  database: SupplierMutationDatabase,
  supplierId: string,
) {
  return database
    .delete(supplierCategories)
    .where(eq(supplierCategories.supplierId, supplierId));
}

export function buildSupplierCategoriesInsertQuery(
  database: SupplierMutationDatabase,
  supplierId: string,
  categories: SupplierMutationValues["categories"],
) {
  return database
    .insert(supplierCategories)
    .values(
      categories.map((category) => ({
        supplierId,
        category,
      })),
    )
    .returning({ category: supplierCategories.category });
}

export function buildSupplierCategoriesForUpdateQuery(
  database: SupplierMutationDatabase,
  supplierId: string,
) {
  return database
    .select({ category: supplierCategories.category })
    .from(supplierCategories)
    .where(eq(supplierCategories.supplierId, supplierId))
    .orderBy(asc(supplierCategories.category));
}

interface IdentityValues {
  readonly name: string | SQLWrapper;
  readonly floor: string | SQLWrapper | null;
  readonly locationDescription: string | SQLWrapper;
}

interface NormalizedIdentity {
  readonly name: SQL;
  readonly floor: SQL;
  readonly locationDescription: SQL;
}

function normalizedIdentity(values: IdentityValues): NormalizedIdentity {
  return {
    name: normalizedRequiredText(values.name),
    floor: normalizedFloor(values.floor),
    locationDescription: normalizedRequiredText(
      values.locationDescription,
    ),
  };
}

function normalizedRequiredText(value: string | SQLWrapper): SQL {
  return sql`lower(normalize(btrim(${value}), NFC))`;
}

function normalizedFloor(value: string | SQLWrapper | null): SQL {
  return sql`
    lower(normalize(coalesce(nullif(btrim(${value}), ''), ''), NFC))
  `;
}

function mapCoordinate(value: number | null): string | null {
  return value === null ? null : String(value);
}
