/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: tested role-aware ACTIVE and ARCHIVED Supplier catalogue policy for
 * issue #17.
 * Author review: Reviewed and approved by @ron.
 */
import { ForbiddenException, NotFoundException } from "@nestjs/common";

import { VerifiedPrincipal } from "../../auth/session-verifier";
import { SupplierReadService } from "../read/supplier-read.service";
import {
  SupplierListQuery,
  SupplierReadModel,
} from "../read/supplier-read.types";
import { SupplierCatalogueService } from "./supplier-catalogue.service";

const SUPPLIER_ID = "ac2288df-661c-5d78-bcc1-ac6bca30fe51";
const MEMBER: VerifiedPrincipal = {
  id: "67ef02dc-814d-49e2-b6c2-9bdc433924c0",
  role: "MEMBER",
};
const ADMINISTRATOR: VerifiedPrincipal = {
  ...MEMBER,
  role: "ADMINISTRATOR",
};
const ACTIVE_QUERY: SupplierListQuery = {
  status: "ACTIVE",
  page: 0,
  size: 12,
  sort: "name,asc",
};

describe("SupplierCatalogueService", () => {
  it("allows MEMBER to browse ACTIVE Suppliers", async () => {
    const reads = createReads();
    const page = { items: [], page: 0, size: 12, totalItems: 0, totalPages: 0 };
    reads.list.mockResolvedValue(page);

    await expect(new SupplierCatalogueService(reads).list(ACTIVE_QUERY, MEMBER))
      .resolves.toBe(page);
  });

  it("returns 403 before reading when MEMBER explicitly requests ARCHIVED", () => {
    const reads = createReads();
    const service = new SupplierCatalogueService(reads);

    expect(() =>
      service.list({ ...ACTIVE_QUERY, status: "ARCHIVED" }, MEMBER),
    ).toThrow(ForbiddenException);
    expect(reads.list).not.toHaveBeenCalled();
  });

  it("allows ADMINISTRATOR to browse ARCHIVED Suppliers", async () => {
    const reads = createReads();
    const page = { items: [], page: 0, size: 12, totalItems: 0, totalPages: 0 };
    reads.list.mockResolvedValue(page);
    const query = { ...ACTIVE_QUERY, status: "ARCHIVED" as const };

    await expect(new SupplierCatalogueService(reads).list(query, ADMINISTRATOR))
      .resolves.toBe(page);
    expect(reads.list).toHaveBeenCalledWith(query);
  });

  it("returns ACTIVE detail to either verified role", async () => {
    const reads = createReads();
    const supplier = createSupplier("ACTIVE");
    reads.findById.mockResolvedValue(supplier);

    await expect(new SupplierCatalogueService(reads).get(SUPPLIER_ID, MEMBER))
      .resolves.toBe(supplier);
    expect(reads.findById).toHaveBeenCalledTimes(1);
    expect(reads.findById).toHaveBeenCalledWith(SUPPLIER_ID, "ACTIVE");
  });

  it("conceals ARCHIVED detail from MEMBER using the unknown-detail 404", async () => {
    const reads = createReads();
    reads.findById.mockResolvedValue(null);
    const service = new SupplierCatalogueService(reads);

    await expect(service.get(SUPPLIER_ID, MEMBER)).rejects.toEqual(
      expect.objectContaining({
        response: {
          code: "SUPPLIER_NOT_FOUND",
          message: "The Supplier was not found.",
        },
        status: 404,
      }),
    );
    expect(reads.findById).toHaveBeenCalledTimes(1);
  });

  it("returns ARCHIVED detail to ADMINISTRATOR", async () => {
    const reads = createReads();
    const archived = createSupplier("ARCHIVED");
    reads.findById
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(archived);

    await expect(
      new SupplierCatalogueService(reads).get(SUPPLIER_ID, ADMINISTRATOR),
    ).resolves.toBe(archived);
    expect(reads.findById).toHaveBeenNthCalledWith(1, SUPPLIER_ID, "ACTIVE");
    expect(reads.findById).toHaveBeenNthCalledWith(2, SUPPLIER_ID, "ARCHIVED");
  });

  it("returns the same 404 for an unknown Supplier", async () => {
    const reads = createReads();
    reads.findById.mockResolvedValue(null);

    await expect(
      new SupplierCatalogueService(reads).get(SUPPLIER_ID, ADMINISTRATOR),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

function createReads(): jest.Mocked<SupplierReadService> {
  return {
    list: jest.fn(),
    findById: jest.fn(),
  } as unknown as jest.Mocked<SupplierReadService>;
}

function createSupplier(status: "ACTIVE" | "ARCHIVED"): SupplierReadModel {
  return {
    id: SUPPLIER_ID,
    name: "Printer @ Com 2",
    categories: ["PRINTING"],
    buildingCode: "COM2",
    buildingLabel: "COM2",
    floor: "1",
    locationDescription: "Next to LT19",
    latitude: 1.2938347,
    longitude: 103.7744572,
    hoursKind: "INTERVAL",
    opensAt: "00:00",
    closesAt: "23:59",
    imagePath: "/assets/suppliers/PRINTER_COM2.jpeg",
    status,
    version: 3,
    createdAt: "2026-09-24T08:00:00.000Z",
    updatedAt: "2026-09-25T08:00:00.000Z",
    archivedAt: status === "ARCHIVED" ? "2026-09-25T08:00:00.000Z" : null,
  };
}
