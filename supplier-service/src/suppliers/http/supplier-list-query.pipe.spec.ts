/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: tested exact Supplier list query defaults, normalization, allowlists,
 * Unicode search bounds, and scalar validation for issue #17.
 * Author review: Reviewed and approved by @ron.
 */
import { BadRequestException } from "@nestjs/common";

import {
  parseSupplierListQuery,
  SUPPLIER_LIST_MAX_SEARCH_LENGTH,
} from "./supplier-list-query.pipe";

describe("parseSupplierListQuery", () => {
  it("applies the approved ACTIVE, paging, and name sort defaults", () => {
    expect(parseSupplierListQuery({})).toEqual({
      q: undefined,
      buildingCode: undefined,
      category: undefined,
      status: "ACTIVE",
      page: 0,
      size: 12,
      sort: "name,asc",
    });
  });

  it("trims search and accepts every supported query dimension", () => {
    expect(
      parseSupplierListQuery({
        q: "  coffee_100%  ",
        buildingCode: "COM2",
        category: "COFFEE",
        status: "ARCHIVED",
        page: "2",
        size: "100",
        sort: "updatedAt,desc",
      }),
    ).toEqual({
      q: "coffee_100%",
      buildingCode: "COM2",
      category: "COFFEE",
      status: "ARCHIVED",
      page: 2,
      size: 100,
      sort: "updatedAt,desc",
    });
  });

  it("treats a blank search as omitted", () => {
    expect(parseSupplierListQuery({ q: "  " }).q).toBeUndefined();
  });

  it("accepts 300 trimmed Unicode characters", () => {
    const q = "💡".repeat(SUPPLIER_LIST_MAX_SEARCH_LENGTH);

    expect(parseSupplierListQuery({ q: `  ${q}  ` }).q).toBe(q);
  });

  it("rejects 301 trimmed Unicode characters with the existing 400 shape", () => {
    const q = "💡".repeat(SUPPLIER_LIST_MAX_SEARCH_LENGTH + 1);

    try {
      parseSupplierListQuery({ q });
      throw new Error("Expected query validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getStatus()).toBe(400);
      expect((error as BadRequestException).getResponse()).toEqual({
        code: "SUPPLIER_VALIDATION_FAILED",
        message: "Please correct the query parameters.",
        fieldErrors: { q: "Search must be at most 300 characters." },
      });
    }
  });

  it("rejects a page and size whose database offset is not a safe integer", () => {
    expectValidationError(
      { page: Number.MAX_SAFE_INTEGER.toString(), size: "100" },
      "page",
    );
  });

  it.each([
    [{ buildingCode: "COM1" }, "buildingCode"],
    [{ category: "BOOKS" }, "category"],
    [{ status: "ALL" }, "status"],
    [{ sort: "name,ascending" }, "sort"],
    [{ page: "-1" }, "page"],
    [{ page: "1.5" }, "page"],
    [{ size: "0" }, "size"],
    [{ size: "101" }, "size"],
    [{ size: ["12", "24"] }, "size"],
    [{ extra: "value" }, "extra"],
  ] as const)("rejects invalid query %#", (query, field) => {
    expectValidationError(query, field);
  });

  it("reports all invalid parameters together", () => {
    try {
      parseSupplierListQuery({ status: "ALL", page: "-1" });
      throw new Error("Expected query validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual({
        code: "SUPPLIER_VALIDATION_FAILED",
        message: "Please correct the query parameters.",
        fieldErrors: {
          status: "Status must be ACTIVE or ARCHIVED.",
          page: `Provide an integer from 0 to ${Number.MAX_SAFE_INTEGER}.`,
        },
      });
    }
  });
});

function expectValidationError(
  query: Record<string, unknown>,
  field: string,
): void {
  try {
    parseSupplierListQuery(query);
    throw new Error("Expected query validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual(
      expect.objectContaining({
        code: "SUPPLIER_VALIDATION_FAILED",
        fieldErrors: expect.objectContaining({ [field]: expect.any(String) }),
      }),
    );
  }
}
