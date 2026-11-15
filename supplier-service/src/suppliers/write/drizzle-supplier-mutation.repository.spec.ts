/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-26.
 * Scope: tested transactional mutation orchestration, optimistic conflicts, duplicate results, and lifecycle no-ops.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-26; tested bigint
 * persistence-boundary behavior for issue #22. Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-26; verified final
 * review's create-only scope for duplicate detection. Author review: Reviewed and approved by @ron.
 */
import { DatabaseService } from "../../database/database.service";
import { SupplierCategory } from "../../database/schema";
import { SupplierDatabaseRow } from "../read/supplier-read.mapper";
import { SupplierMutationValues } from "../supplier-mutation.values";
import {
  buildDuplicateIdentityLockQuery,
  buildDuplicateSupplierQuery,
  buildSupplierArchiveQuery,
  buildSupplierCategoriesDeleteQuery,
  buildSupplierCategoriesForUpdateQuery,
  buildSupplierCategoriesInsertQuery,
  buildSupplierInsertQuery,
  buildSupplierLockQuery,
  buildSupplierRestoreQuery,
  buildSupplierUpdateQuery,
  SupplierMutationDatabase,
} from "./drizzle-supplier-mutation.queries";
import { DrizzleSupplierMutationRepository } from "./drizzle-supplier-mutation.repository";

jest.mock("./drizzle-supplier-mutation.queries", () => ({
  buildDuplicateIdentityLockQuery: jest.fn(),
  buildDuplicateSupplierQuery: jest.fn(),
  buildSupplierArchiveQuery: jest.fn(),
  buildSupplierCategoriesDeleteQuery: jest.fn(),
  buildSupplierCategoriesForUpdateQuery: jest.fn(),
  buildSupplierCategoriesInsertQuery: jest.fn(),
  buildSupplierInsertQuery: jest.fn(),
  buildSupplierLockQuery: jest.fn(),
  buildSupplierRestoreQuery: jest.fn(),
  buildSupplierUpdateQuery: jest.fn(),
}));

describe("DrizzleSupplierMutationRepository", () => {
  const supplierId = "ac2288df-661c-5d78-bcc1-ac6bca30fe51";
  const transaction = {} as SupplierMutationDatabase;
  const transact = jest.fn(
    async <T>(callback: (database: SupplierMutationDatabase) => Promise<T>) =>
      callback(transaction),
  );
  const database = {
    client: { transaction: transact },
  } as unknown as DatabaseService;
  const repository = new DrizzleSupplierMutationRepository(database);
  const values: SupplierMutationValues = {
    name: "Updated Cafe",
    categories: ["FOOD", "COFFEE"],
    buildingCode: "COM2",
    floor: "2",
    locationDescription: "Beside the entrance",
    latitude: 1.2938347,
    longitude: 103.7744572,
    hoursKind: "INTERVAL",
    opensAt: "09:00",
    closesAt: "18:00",
  };

  beforeEach(() => {
    jest.resetAllMocks();
    transact.mockImplementation(
      async <T>(
        callback: (database: SupplierMutationDatabase) => Promise<T>,
      ) => callback(transaction),
    );
    jest
      .mocked(buildDuplicateIdentityLockQuery)
      .mockReturnValue(Promise.resolve() as never);
  });

  it("returns the existing identifier after serializing a duplicate create", async () => {
    jest
      .mocked(buildDuplicateSupplierQuery)
      .mockReturnValue(Promise.resolve([{ id: supplierId }]) as never);

    await expect(repository.create(values)).resolves.toEqual({
      kind: "duplicate",
      existingSupplierId: supplierId,
    });
    expect(buildDuplicateIdentityLockQuery).toHaveBeenCalledWith(
      transaction,
      values,
    );
    expect(buildDuplicateSupplierQuery).toHaveBeenCalledWith(
      transaction,
      values,
    );
    expect(
      jest.mocked(buildDuplicateIdentityLockQuery).mock.invocationCallOrder[0],
    ).toBeLessThan(
      jest.mocked(buildDuplicateSupplierQuery).mock.invocationCallOrder[0]!,
    );
    expect(buildSupplierInsertQuery).not.toHaveBeenCalled();
  });

  it("creates the Supplier and categories in one transaction", async () => {
    const inserted = createRow();
    jest
      .mocked(buildDuplicateSupplierQuery)
      .mockReturnValue(Promise.resolve([]) as never);
    jest
      .mocked(buildSupplierInsertQuery)
      .mockReturnValue(Promise.resolve([inserted]) as never);
    mockInsertedCategories(["FOOD", "COFFEE"]);

    await expect(repository.create(values)).resolves.toMatchObject({
      kind: "created",
      supplier: {
        id: supplierId,
        categories: ["COFFEE", "FOOD"],
        status: "ACTIVE",
        version: 0,
      },
    });
    expect(buildSupplierInsertQuery).toHaveBeenCalledWith(
      transaction,
      values,
    );
    expect(buildSupplierCategoriesInsertQuery).toHaveBeenCalledWith(
      transaction,
      supplierId,
      values.categories,
    );
    expect(transact).toHaveBeenCalledTimes(1);
  });

  it("does not alter the row or categories for a stale full update", async () => {
    jest
      .mocked(buildSupplierLockQuery)
      .mockReturnValue(Promise.resolve([createRow({ version: 4 })]) as never);

    await expect(
      repository.update(supplierId, 900719925474099100000n, values),
    ).resolves.toEqual({
      kind: "stale",
    });
    expect(buildSupplierUpdateQuery).not.toHaveBeenCalled();
    expect(buildSupplierCategoriesDeleteQuery).not.toHaveBeenCalled();
    expect(buildSupplierCategoriesInsertQuery).not.toHaveBeenCalled();
  });

  it.each([
    ["update", () => repository.update(supplierId, 0n, values)],
    ["archive", () => repository.archive(supplierId, 0n)],
    ["restore", () => repository.restore(supplierId, 0n)],
  ] as const)("returns not-found before attempting a %s", async (_name, act) => {
    jest
      .mocked(buildSupplierLockQuery)
      .mockReturnValue(Promise.resolve([]) as never);

    await expect(act()).resolves.toEqual({ kind: "not-found" });
    expect(buildSupplierUpdateQuery).not.toHaveBeenCalled();
    expect(buildSupplierArchiveQuery).not.toHaveBeenCalled();
    expect(buildSupplierRestoreQuery).not.toHaveBeenCalled();
  });

  it("updates an archived Supplier and categories without a create-only duplicate check", async () => {
    const current = createRow({
      status: "ARCHIVED",
      version: 3,
      archivedAt: new Date("2026-09-25T09:00:00.000Z"),
    });
    const updated = createRow({
      ...current,
      name: values.name,
      version: 4,
      updatedAt: new Date("2026-09-26T04:00:00.000Z"),
    });
    jest
      .mocked(buildSupplierLockQuery)
      .mockReturnValue(Promise.resolve([current]) as never);
    jest
      .mocked(buildSupplierUpdateQuery)
      .mockReturnValue(Promise.resolve([updated]) as never);
    jest
      .mocked(buildSupplierCategoriesDeleteQuery)
      .mockReturnValue(Promise.resolve() as never);
    mockInsertedCategories(["COFFEE"]);

    await expect(
      repository.update(supplierId, 3n, values),
    ).resolves.toMatchObject({
      kind: "updated",
      supplier: {
        name: values.name,
        categories: ["COFFEE"],
        status: "ARCHIVED",
        version: 4,
        archivedAt: "2026-09-25T09:00:00.000Z",
      },
    });
    expect(buildSupplierUpdateQuery).toHaveBeenCalledWith(
      transaction,
      supplierId,
      3,
      "ARCHIVED",
      values,
    );
    expect(buildSupplierCategoriesDeleteQuery).toHaveBeenCalledWith(
      transaction,
      supplierId,
    );
    expect(buildSupplierCategoriesInsertQuery).toHaveBeenCalledWith(
      transaction,
      supplierId,
      values.categories,
    );
    expect(buildDuplicateIdentityLockQuery).not.toHaveBeenCalled();
    expect(buildDuplicateSupplierQuery).not.toHaveBeenCalled();
  });

  it("requires a version for an ACTIVE archive without issuing an update", async () => {
    jest
      .mocked(buildSupplierLockQuery)
      .mockReturnValue(Promise.resolve([createRow()]) as never);

    await expect(repository.archive(supplierId, null)).resolves.toEqual({
      kind: "precondition-required",
    });
    expect(buildSupplierArchiveQuery).not.toHaveBeenCalled();
  });

  it.each([null, 1n])(
    "ignores version %p for an already-ARCHIVED no-op",
    async (expectedVersion) => {
      const archivedAt = new Date("2026-09-25T09:00:00.000Z");
      jest.mocked(buildSupplierLockQuery).mockReturnValue(
        Promise.resolve([
          createRow({ status: "ARCHIVED", version: 8, archivedAt }),
        ]) as never,
      );

      await expect(
        repository.archive(supplierId, expectedVersion),
      ).resolves.toEqual({
        kind: "already-archived",
      });
      expect(buildSupplierArchiveQuery).not.toHaveBeenCalled();
      expect(buildSupplierCategoriesDeleteQuery).not.toHaveBeenCalled();
    },
  );

  it("archives with one atomic ACTIVE-version transition", async () => {
    jest
      .mocked(buildSupplierLockQuery)
      .mockReturnValue(Promise.resolve([createRow({ version: 2 })]) as never);
    jest.mocked(buildSupplierArchiveQuery).mockReturnValue(
      Promise.resolve([
        createRow({
          status: "ARCHIVED",
          version: 3,
          archivedAt: new Date("2026-09-26T04:00:00.000Z"),
        }),
      ]) as never,
    );

    await expect(repository.archive(supplierId, 2n)).resolves.toEqual({
      kind: "archived",
    });
    expect(buildSupplierArchiveQuery).toHaveBeenCalledWith(
      transaction,
      supplierId,
      2,
    );
    expect(buildSupplierCategoriesDeleteQuery).not.toHaveBeenCalled();
  });

  it("returns an ACTIVE restore no-op without changing its representation", async () => {
    const current = createRow({ version: 5 });
    jest
      .mocked(buildSupplierLockQuery)
      .mockReturnValue(Promise.resolve([current]) as never);
    jest
      .mocked(buildSupplierCategoriesForUpdateQuery)
      .mockReturnValue(Promise.resolve([{ category: "FOOD" }]) as never);

    await expect(repository.restore(supplierId, 5n)).resolves.toMatchObject({
      kind: "already-active",
      supplier: {
        version: 5,
        updatedAt: current.updatedAt.toISOString(),
        archivedAt: null,
      },
    });
    expect(buildSupplierRestoreQuery).not.toHaveBeenCalled();
  });

  it("rejects a stale restore before loading categories", async () => {
    jest.mocked(buildSupplierLockQuery).mockReturnValue(
      Promise.resolve([
        createRow({
          status: "ARCHIVED",
          version: 6,
          archivedAt: new Date("2026-09-25T09:00:00.000Z"),
        }),
      ]) as never,
    );

    await expect(repository.restore(supplierId, 5n)).resolves.toEqual({
      kind: "stale",
    });
    expect(buildSupplierRestoreQuery).not.toHaveBeenCalled();
    expect(buildSupplierCategoriesForUpdateQuery).not.toHaveBeenCalled();
  });

  it("restores and returns the committed row with its unchanged categories", async () => {
    const archived = createRow({
      status: "ARCHIVED",
      version: 2,
      archivedAt: new Date("2026-09-25T09:00:00.000Z"),
    });
    const restored = createRow({
      version: 3,
      updatedAt: new Date("2026-09-26T04:00:00.000Z"),
    });
    jest
      .mocked(buildSupplierLockQuery)
      .mockReturnValue(Promise.resolve([archived]) as never);
    jest
      .mocked(buildSupplierRestoreQuery)
      .mockReturnValue(Promise.resolve([restored]) as never);
    jest
      .mocked(buildSupplierCategoriesForUpdateQuery)
      .mockReturnValue(Promise.resolve([{ category: "FOOD" }]) as never);

    await expect(repository.restore(supplierId, 2n)).resolves.toMatchObject({
      kind: "restored",
      supplier: {
        status: "ACTIVE",
        version: 3,
        archivedAt: null,
        categories: ["FOOD"],
      },
    });
    expect(buildSupplierRestoreQuery).toHaveBeenCalledWith(
      transaction,
      supplierId,
      2,
    );
  });

  function mockInsertedCategories(
    categories: readonly SupplierCategory[],
  ): void {
    jest.mocked(buildSupplierCategoriesInsertQuery).mockReturnValue(
      Promise.resolve(categories.map((category) => ({ category }))) as never,
    );
  }

  function createRow(
    overrides: Partial<SupplierDatabaseRow> = {},
  ): SupplierDatabaseRow {
    return {
      id: supplierId,
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
      ...overrides,
    };
  }
});
