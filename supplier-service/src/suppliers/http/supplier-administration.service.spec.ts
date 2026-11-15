/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-26.
 * Scope: tested Supplier mutation application policy, stable conflicts, and
 * approved lifecycle precondition behavior for issue #22.
 * Author review: Reviewed and approved by @ron.
 */
import { HttpException } from "@nestjs/common";

import { SupplierReadModel } from "../read/supplier-read.types";
import { SupplierMutationValues } from "../supplier-mutation.values";
import { SupplierMutationRepository } from "../write/supplier-mutation.repository";
import { SupplierAdministrationService } from "./supplier-administration.service";

const SUPPLIER_ID = "ac2288df-661c-5d78-bcc1-ac6bca30fe51";
const EXISTING_ID = "a65dd942-d369-4a16-96c4-24e9ce7055ca";
const VALUES: SupplierMutationValues = {
  name: "Cafe+ Robot Cafe",
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

describe("SupplierAdministrationService", () => {
  it("returns the committed create representation", async () => {
    const mutations = createMutations();
    const supplier = createSupplier();
    mutations.create.mockResolvedValue({ kind: "created", supplier });

    await expect(service(mutations).create(VALUES)).resolves.toBe(supplier);
    expect(mutations.create).toHaveBeenCalledWith(VALUES);
  });

  it("maps duplicate creation to stable 409 details", async () => {
    const mutations = createMutations();
    mutations.create.mockResolvedValue({
      kind: "duplicate",
      existingSupplierId: EXISTING_ID,
    });

    await expectHttpFailure(service(mutations).create(VALUES), 409, {
      code: "SUPPLIER_ALREADY_EXISTS",
      message: "A Supplier already exists at this location.",
      existingSupplierId: EXISTING_ID,
    });
  });

  it("returns 428 before update persistence when If-Match is missing", async () => {
    const mutations = createMutations();

    await expectHttpFailure(
      service(mutations).update(SUPPLIER_ID, undefined, VALUES),
      428,
      {
        code: "SUPPLIER_PRECONDITION_REQUIRED",
        message: "Provide the current Supplier ETag in the If-Match header.",
      },
    );
    expect(mutations.update).not.toHaveBeenCalled();
  });

  it.each([
    ["not-found", 404, "SUPPLIER_NOT_FOUND"],
    ["stale", 412, "SUPPLIER_VERSION_CONFLICT"],
  ] as const)(
    "maps a %s update after preserving a huge canonical version",
    async (kind, status, code) => {
      const mutations = createMutations();
      mutations.update.mockResolvedValue({ kind });

      await expectHttpFailure(
        service(mutations).update(
          SUPPLIER_ID,
          '"v900719925474099100000"',
          VALUES,
        ),
        status,
        expect.objectContaining({ code }),
      );
      expect(mutations.update).toHaveBeenCalledWith(
        SUPPLIER_ID,
        900719925474099100000n,
        VALUES,
      );
    },
  );

  it("ignores even a malformed If-Match for repeat archive", async () => {
    const mutations = createMutations();
    mutations.archive.mockResolvedValue({ kind: "already-archived" });

    await expect(
      service(mutations).archive(SUPPLIER_ID, 'W/"v4"'),
    ).resolves.toBeUndefined();
    expect(mutations.archive).toHaveBeenCalledTimes(1);
    expect(mutations.archive).toHaveBeenCalledWith(SUPPLIER_ID, null);
  });

  it("returns 404 for unknown archive before interpreting If-Match", async () => {
    const mutations = createMutations();
    mutations.archive.mockResolvedValue({ kind: "not-found" });

    await expectHttpFailure(
      service(mutations).archive(SUPPLIER_ID, 'W/"v4"'),
      404,
      expect.objectContaining({ code: "SUPPLIER_NOT_FOUND" }),
    );
    expect(mutations.archive).toHaveBeenCalledTimes(1);
  });

  it("requires If-Match only after finding an ACTIVE archive target", async () => {
    const mutations = createMutations();
    mutations.archive.mockResolvedValue({ kind: "precondition-required" });

    await expectHttpFailure(
      service(mutations).archive(SUPPLIER_ID, undefined),
      428,
      expect.objectContaining({ code: "SUPPLIER_PRECONDITION_REQUIRED" }),
    );
    expect(mutations.archive).toHaveBeenCalledTimes(1);
  });

  it("archives ACTIVE with the parsed bigint version", async () => {
    const mutations = createMutations();
    mutations.archive
      .mockResolvedValueOnce({ kind: "precondition-required" })
      .mockResolvedValueOnce({ kind: "archived" });

    await expect(
      service(mutations).archive(SUPPLIER_ID, '"v4"'),
    ).resolves.toBeUndefined();
    expect(mutations.archive).toHaveBeenNthCalledWith(1, SUPPLIER_ID, null);
    expect(mutations.archive).toHaveBeenNthCalledWith(2, SUPPLIER_ID, 4n);
  });

  it("returns an unchanged ACTIVE representation for restore no-op", async () => {
    const mutations = createMutations();
    const supplier = createSupplier();
    mutations.restore.mockResolvedValue({
      kind: "already-active",
      supplier,
    });

    await expect(
      service(mutations).restore(SUPPLIER_ID, '"v4"'),
    ).resolves.toBe(supplier);
    expect(mutations.restore).toHaveBeenCalledWith(SUPPLIER_ID, 4n);
  });
});

function service(
  mutations: jest.Mocked<SupplierMutationRepository>,
): SupplierAdministrationService {
  return new SupplierAdministrationService(mutations);
}

function createMutations(): jest.Mocked<SupplierMutationRepository> {
  return {
    create: jest.fn(),
    update: jest.fn(),
    archive: jest.fn(),
    restore: jest.fn(),
  } as jest.Mocked<SupplierMutationRepository>;
}

async function expectHttpFailure(
  promise: Promise<unknown>,
  status: number,
  response: unknown,
): Promise<void> {
  try {
    await promise;
    throw new Error("Expected Supplier request to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(status);
    expect((error as HttpException).getResponse()).toEqual(response);
  }
}

function createSupplier(): SupplierReadModel {
  return {
    id: SUPPLIER_ID,
    name: VALUES.name,
    categories: VALUES.categories,
    buildingCode: VALUES.buildingCode,
    buildingLabel: "COM2",
    floor: VALUES.floor,
    locationDescription: VALUES.locationDescription,
    latitude: VALUES.latitude,
    longitude: VALUES.longitude,
    hoursKind: VALUES.hoursKind,
    opensAt: VALUES.opensAt,
    closesAt: VALUES.closesAt,
    imagePath: null,
    status: "ACTIVE",
    version: 4,
    createdAt: "2026-09-24T08:00:00.000Z",
    updatedAt: "2026-09-26T04:00:00.000Z",
    archivedAt: null,
  };
}
