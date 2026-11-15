/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: verified generated Supplier list/detail SQL for filters, counts, pagination, and stable sorting.
 * Author review: Reviewed and approved by @ron.
 */
import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "../../database/schema";
import {
  buildSupplierCategoriesQuery,
  buildSupplierCountQuery,
  buildSupplierDetailQuery,
  buildSupplierPageQuery,
} from "./drizzle-supplier-read.queries";
import { SupplierListQuery } from "./supplier-read.types";

describe("Supplier Drizzle read queries", () => {
  const database = drizzle.mock({ schema });
  const completeQuery: SupplierListQuery = {
    q: "coffee%_",
    buildingCode: "COM2",
    category: "COFFEE",
    status: "ARCHIVED",
    page: 2,
    size: 12,
    sort: "name,asc",
  };

  it("filters before paging and uses EXISTS so categories cannot duplicate rows", () => {
    const query = buildSupplierPageQuery(database, completeQuery).toSQL();
    const sql = normalizeSql(query.sql);

    expect(sql).toContain('from "suppliers" where');
    expect(sql).toContain('"suppliers"."status" =');
    expect(sql).toContain(
      'strpos(lower("suppliers"."name"), lower($2)) > 0',
    );
    expect(sql).toContain(
      'strpos(lower("suppliers"."location_description"), lower($3)) > 0',
    );
    expect(sql).toContain('"suppliers"."building_code" =');
    expect(sql).toContain("exists (select 1 from \"supplier_categories\"");
    expect(sql).not.toContain(" join ");
    expect(sql).toContain(
      'order by "suppliers"."name" asc, "suppliers"."id" asc limit $6 offset $7',
    );
    expect(query.params).toEqual([
      "ARCHIVED",
      "coffee%_",
      "coffee%_",
      "COM2",
      "COFFEE",
      12,
      24,
    ]);
  });

  it("counts filtered Suppliers without a category join", () => {
    const query = buildSupplierCountQuery(database, completeQuery).toSQL();
    const sql = normalizeSql(query.sql);

    expect(sql).toContain('select count(*) from "suppliers" where');
    expect(sql).toContain("exists (select 1 from \"supplier_categories\"");
    expect(sql).not.toContain(" join ");
    expect(sql).not.toContain(" limit ");
    expect(sql).not.toContain(" offset ");
  });

  it.each([
    ["name,asc", '"suppliers"."name" asc, "suppliers"."id" asc'],
    ["name,desc", '"suppliers"."name" desc, "suppliers"."id" asc'],
    [
      "updatedAt,desc",
      '"suppliers"."updated_at" desc, "suppliers"."id" asc',
    ],
  ] as const)("applies stable %s sorting", (sort, expectedOrder) => {
    const query = buildSupplierPageQuery(database, {
      status: "ACTIVE",
      page: 0,
      size: 12,
      sort,
    }).toSQL();

    expect(normalizeSql(query.sql)).toContain(`order by ${expectedOrder}`);
  });

  it("selects detail by Supplier Identifier and requested status", () => {
    const query = buildSupplierDetailQuery(
      database,
      "ac2288df-661c-5d78-bcc1-ac6bca30fe51",
      "ACTIVE",
    ).toSQL();
    const sql = normalizeSql(query.sql);

    expect(sql).toContain(
      'where ("suppliers"."id" = $1 and "suppliers"."status" = $2) limit $3',
    );
    expect(query.params).toEqual([
      "ac2288df-661c-5d78-bcc1-ac6bca30fe51",
      "ACTIVE",
      1,
    ]);
  });

  it("loads categories for only the page Supplier Identifiers", () => {
    const query = buildSupplierCategoriesQuery(database, [
      "ac2288df-661c-5d78-bcc1-ac6bca30fe51",
      "70f78786-0bec-5d26-a2ac-8ef4f7252391",
    ]).toSQL();
    const sql = normalizeSql(query.sql);

    expect(sql).toContain(
      'where "supplier_categories"."supplier_id" in ($1, $2)',
    );
    expect(sql).toContain(
      'order by "supplier_categories"."supplier_id" asc, "supplier_categories"."category" asc',
    );
  });

  function normalizeSql(sql: string): string {
    return sql.replace(/\s+/g, " ").trim();
  }
});
