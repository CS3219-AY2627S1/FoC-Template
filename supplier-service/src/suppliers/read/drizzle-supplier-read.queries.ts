/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: implemented parameterized Drizzle queries for filtered, stable Supplier catalogue reads.
 * Author review: Reviewed and approved by @ron.
 */
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  inArray,
  SQL,
  sql,
} from "drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "../../database/schema";
import {
  supplierCategories,
  suppliers,
} from "../../database/schema";
import { SupplierListQuery, SupplierStatus } from "./supplier-read.types";

export type SupplierReadDatabase = NodePgDatabase<typeof schema>;

export function buildSupplierPageQuery(
  database: SupplierReadDatabase,
  query: SupplierListQuery,
) {
  return database
    .select()
    .from(suppliers)
    .where(buildSupplierListPredicate(database, query))
    .orderBy(...buildSupplierOrder(query))
    .limit(query.size)
    .offset(query.page * query.size);
}

export function buildSupplierCountQuery(
  database: SupplierReadDatabase,
  query: SupplierListQuery,
) {
  return database
    .select({ totalItems: count() })
    .from(suppliers)
    .where(buildSupplierListPredicate(database, query));
}

export function buildSupplierDetailQuery(
  database: SupplierReadDatabase,
  supplierId: string,
  status: SupplierStatus,
) {
  return database
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.status, status)))
    .limit(1);
}

export function buildSupplierCategoriesQuery(
  database: SupplierReadDatabase,
  supplierIds: readonly string[],
) {
  return database
    .select({
      supplierId: supplierCategories.supplierId,
      category: supplierCategories.category,
    })
    .from(supplierCategories)
    .where(inArray(supplierCategories.supplierId, [...supplierIds]))
    .orderBy(
      asc(supplierCategories.supplierId),
      asc(supplierCategories.category),
    );
}

function buildSupplierListPredicate(
  database: SupplierReadDatabase,
  query: SupplierListQuery,
): SQL {
  const predicates: SQL[] = [eq(suppliers.status, query.status)];

  if (query.q !== undefined) {
    predicates.push(
      sql`(
        strpos(lower(${suppliers.name}), lower(${query.q})) > 0
        or strpos(lower(${suppliers.locationDescription}), lower(${query.q})) > 0
      )`,
    );
  }

  if (query.buildingCode !== undefined) {
    predicates.push(eq(suppliers.buildingCode, query.buildingCode));
  }

  if (query.category !== undefined) {
    predicates.push(
      exists(
        database
          .select({ value: sql`1` })
          .from(supplierCategories)
          .where(
            and(
              eq(supplierCategories.supplierId, suppliers.id),
              eq(supplierCategories.category, query.category),
            ),
          ),
      ),
    );
  }

  return and(...predicates) as SQL;
}

function buildSupplierOrder(query: SupplierListQuery): [SQL, SQL] {
  switch (query.sort) {
    case "name,asc":
      return [asc(suppliers.name), asc(suppliers.id)];
    case "name,desc":
      return [desc(suppliers.name), asc(suppliers.id)];
    case "updatedAt,desc":
      return [desc(suppliers.updatedAt), asc(suppliers.id)];
  }
}
