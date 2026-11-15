/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: tested PostgreSQL read orchestration, category grouping, totals, and absent detail behavior.
 * Author review: Reviewed and approved by @ron.
 */
import { DatabaseService } from "../../database/database.service";
import {
  buildSupplierCategoriesQuery,
  buildSupplierCountQuery,
  buildSupplierDetailQuery,
  buildSupplierPageQuery,
} from "./drizzle-supplier-read.queries";
import { DrizzleSupplierReadRepository } from "./drizzle-supplier-read.repository";
import { SupplierDatabaseRow } from "./supplier-read.mapper";
import { SupplierListQuery } from "./supplier-read.types";

jest.mock("./drizzle-supplier-read.queries", () => ({
  buildSupplierCategoriesQuery: jest.fn(),
  buildSupplierCountQuery: jest.fn(),
  buildSupplierDetailQuery: jest.fn(),
  buildSupplierPageQuery: jest.fn(),
}));

describe("DrizzleSupplierReadRepository", () => {
  const database = { client: {} } as unknown as DatabaseService;
  const query: SupplierListQuery = {
    status: "ACTIVE",
    page: 1,
    size: 2,
    sort: "name,asc",
  };
  const row = createRow();

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("groups categories onto Suppliers and calculates page totals", async () => {
    jest
      .mocked(buildSupplierPageQuery)
      .mockReturnValue(Promise.resolve([row]) as never);
    jest
      .mocked(buildSupplierCountQuery)
      .mockReturnValue(Promise.resolve([{ totalItems: 5 }]) as never);
    jest.mocked(buildSupplierCategoriesQuery).mockReturnValue(
      Promise.resolve([
        { supplierId: row.id, category: "FOOD" },
        { supplierId: row.id, category: "COFFEE" },
      ]) as never,
    );
    const repository = new DrizzleSupplierReadRepository(database);

    await expect(repository.list(query)).resolves.toMatchObject({
      items: [
        {
          id: row.id,
          categories: ["FOOD", "COFFEE"],
          buildingLabel: "COM2",
        },
      ],
      page: 1,
      size: 2,
      totalItems: 5,
      totalPages: 3,
    });
    expect(buildSupplierCategoriesQuery).toHaveBeenCalledWith(
      database.client,
      [row.id],
    );
  });

  it("does not issue a category query for an empty page", async () => {
    jest
      .mocked(buildSupplierPageQuery)
      .mockReturnValue(Promise.resolve([]) as never);
    jest
      .mocked(buildSupplierCountQuery)
      .mockReturnValue(Promise.resolve([{ totalItems: 0 }]) as never);
    const repository = new DrizzleSupplierReadRepository(database);

    await expect(repository.list(query)).resolves.toEqual({
      items: [],
      page: 1,
      size: 2,
      totalItems: 0,
      totalPages: 0,
    });
    expect(buildSupplierCategoriesQuery).not.toHaveBeenCalled();
  });

  it("returns null when the requested Supplier and status are absent", async () => {
    jest
      .mocked(buildSupplierDetailQuery)
      .mockReturnValue(Promise.resolve([]) as never);
    const repository = new DrizzleSupplierReadRepository(database);

    await expect(
      repository.findById(row.id, "ARCHIVED"),
    ).resolves.toBeNull();
    expect(buildSupplierCategoriesQuery).not.toHaveBeenCalled();
  });

  function createRow(): SupplierDatabaseRow {
    return {
      id: "ac2288df-661c-5d78-bcc1-ac6bca30fe51",
      name: "Cafe+ Robot Cafe",
      buildingCode: "COM2",
      floor: "2",
      locationDescription: "Beside the entrance",
      latitude: "1.2938347",
      longitude: "103.7744572",
      hoursKind: "INTERVAL",
      opensAt: "09:00:00",
      closesAt: "18:00:00",
      imagePath: null,
      status: "ACTIVE",
      version: 0,
      createdAt: new Date("2026-09-24T08:00:00.000Z"),
      updatedAt: new Date("2026-09-24T08:00:00.000Z"),
      archivedAt: null,
    };
  }
});
