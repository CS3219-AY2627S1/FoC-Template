/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-26.
 * Scope: verified generated mutation SQL for normalized duplicate serialization,
 * including its explicit PostgreSQL parameter type, row locks, and atomic
 * state/version predicates.
 * Author review: Reviewed and approved by @ron.
 */
import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "../../database/schema";
import { SupplierMutationValues } from "../supplier-mutation.values";
import {
  buildDuplicateIdentityLockQuery,
  buildDuplicateSupplierQuery,
  buildSupplierArchiveQuery,
  buildSupplierCategoriesDeleteQuery,
  buildSupplierCategoriesInsertQuery,
  buildSupplierInsertQuery,
  buildSupplierLockQuery,
  buildSupplierRestoreQuery,
  buildSupplierUpdateQuery,
} from "./drizzle-supplier-mutation.queries";

describe("Supplier Drizzle mutation queries", () => {
  const database = drizzle.mock({ schema });
  const supplierId = "ac2288df-661c-5d78-bcc1-ac6bca30fe51";
  const values: SupplierMutationValues = {
    name: "  Cafe\u0301  ",
    categories: ["FOOD", "COFFEE"],
    buildingCode: "COM2",
    floor: "  02  ",
    locationDescription: "  Beside  the entrance  ",
    latitude: 1.2938347,
    longitude: 103.7744572,
    hoursKind: "INTERVAL",
    opensAt: "09:00",
    closesAt: "18:00",
  };

  it("serializes concurrent creates with the exact normalized identity", () => {
    const lock = buildDuplicateIdentityLockQuery(database, values).toSQL();
    const duplicate = buildDuplicateSupplierQuery(database, values).toSQL();
    const lockSql = normalizeSql(lock.sql);
    const duplicateSql = normalizeSql(duplicate.sql);

    expect(lockSql).toContain("pg_advisory_xact_lock");
    expect(lockSql).toContain("hashtextextended(");
    expect(lockSql).toContain("jsonb_build_array(");
    expect(lockSql).toContain("lower(normalize(btrim($1), NFC))");
    expect(lockSql).toContain("$2::text");
    expect(lockSql).toContain(
      "lower(normalize(coalesce(nullif(btrim($3), ''), ''), NFC))",
    );
    expect(lock.params).toEqual([
      values.name,
      values.buildingCode,
      values.floor,
      values.locationDescription,
    ]);

    expect(duplicateSql).toContain('from "suppliers" where');
    expect(duplicateSql).toContain(
      'lower(normalize(btrim("suppliers"."name"), NFC)) = lower(normalize(btrim($1), NFC))',
    );
    expect(duplicateSql).toContain(
      'lower(normalize(coalesce(nullif(btrim("suppliers"."floor"), \'\'), \'\'), NFC)) = lower(normalize(coalesce(nullif(btrim($3), \'\'), \'\'), NFC))',
    );
    expect(duplicateSql).not.toContain('"suppliers"."status" =');
    expect(duplicate.params).toEqual([
      values.name,
      values.buildingCode,
      values.floor,
      values.locationDescription,
      1,
    ]);
  });

  it("creates an ACTIVE version-zero Supplier without client-owned metadata", () => {
    const query = buildSupplierInsertQuery(database, values).toSQL();
    const sql = normalizeSql(query.sql);

    expect(sql).toContain('insert into "suppliers"');
    expect(sql).toContain('"image_path"');
    expect(sql).toContain('"status"');
    expect(sql).toContain('"version"');
    expect(sql).toContain("values (default,");
    expect(sql).toContain('"created_at", "updated_at"');
    expect(sql).toContain("default, default");
    expect(query.params).toContain("ACTIVE");
    expect(query.params).toContain(0);
    expect(query.params).toContain(null);
  });

  it("locks a Supplier before classifying missing, stale, or no-op outcomes", () => {
    const query = buildSupplierLockQuery(database, supplierId).toSQL();

    expect(normalizeSql(query.sql)).toContain(
      'where "suppliers"."id" = $1 limit $2 for update',
    );
    expect(query.params).toEqual([supplierId, 1]);
  });

  it("fully updates by id, version, and preserved status", () => {
    const query = buildSupplierUpdateQuery(
      database,
      supplierId,
      3,
      "ARCHIVED",
      values,
    ).toSQL();
    const sql = normalizeSql(query.sql);

    expect(sql).toContain('update "suppliers" set');
    expect(sql).toContain('"version" = "suppliers"."version" + 1');
    expect(sql).toContain('"updated_at" = current_timestamp');
    const assignments = sql.split(" where ")[0];
    expect(assignments).not.toContain('"status" =');
    expect(assignments).not.toContain('"archived_at" =');
    expect(sql).toContain(
      'where ("suppliers"."id" = $10 and "suppliers"."version" = $11 and "suppliers"."status" = $12)',
    );
    expect(query.params.slice(-3)).toEqual([supplierId, 3, "ARCHIVED"]);
  });

  it.each([
    ["archive", buildSupplierArchiveQuery, "ARCHIVED", "ACTIVE"],
    ["restore", buildSupplierRestoreQuery, "ACTIVE", "ARCHIVED"],
  ] as const)(
    "%s changes state once with an id, version, and source-status predicate",
    (_name, buildQuery, targetStatus, sourceStatus) => {
      const query = buildQuery(database, supplierId, 7).toSQL();
      const sql = normalizeSql(query.sql);

      expect(sql).toContain('"status" = $1');
      expect(sql).toContain('"updated_at" = current_timestamp');
      expect(sql).toContain('"version" = "suppliers"."version" + 1');
      if (_name === "archive") {
        expect(sql).toContain('"archived_at" = current_timestamp');
      } else {
        expect(query.params).toContain(null);
      }
      expect(sql.replace(/\$\d+/g, "?")).toContain(
        'where ("suppliers"."id" = ? and "suppliers"."version" = ? and "suppliers"."status" = ?)',
      );
      expect(query.params[0]).toBe(targetStatus);
      expect(query.params.slice(-3)).toEqual([supplierId, 7, sourceStatus]);
    },
  );

  it("replaces only category rows for the locked Supplier", () => {
    const deletion = buildSupplierCategoriesDeleteQuery(
      database,
      supplierId,
    ).toSQL();
    const insertion = buildSupplierCategoriesInsertQuery(
      database,
      supplierId,
      values.categories,
    ).toSQL();

    expect(normalizeSql(deletion.sql)).toBe(
      'delete from "supplier_categories" where "supplier_categories"."supplier_id" = $1',
    );
    expect(deletion.params).toEqual([supplierId]);
    expect(normalizeSql(insertion.sql)).toContain(
      'insert into "supplier_categories" ("supplier_id", "category") values ($1, $2), ($3, $4)',
    );
    expect(insertion.params).toEqual([
      supplierId,
      "FOOD",
      supplierId,
      "COFFEE",
    ]);
  });

  function normalizeSql(sql: string): string {
    return sql.replace(/\s+/g, " ").trim();
  }
});
