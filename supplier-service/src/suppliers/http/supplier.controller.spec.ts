/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: tested Supplier controller delegation and exact strong detail ETag
 * behavior for issue #17.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-26; tested mutation
 * role metadata, delegation, statuses, and headers for issue #22.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-27; tested the
 * issue #33 authenticated metadata response and role policy.
 * Contract decision and implementation reviewed and approved by @ron.
 */
import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
} from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";

import {
  AuthenticatedSupplierRequest,
  SUPPLIER_REQUIRED_ROLES,
  SupplierAuthGuard,
} from "../../auth/supplier-auth.guard";
import {
  SessionVerifier,
  VerifiedPrincipal,
} from "../../auth/session-verifier";
import { BUILDING_OPTIONS } from "../../domain/buildings";
import { SupplierReadModel } from "../read/supplier-read.types";
import { SupplierMutationValues } from "../supplier-mutation.values";
import { SupplierAdministrationService } from "./supplier-administration.service";
import { SupplierCatalogueService } from "./supplier-catalogue.service";
import { SupplierController } from "./supplier.controller";

const SUPPLIER_ID = "ac2288df-661c-5d78-bcc1-ac6bca30fe51";
const PRINCIPAL: VerifiedPrincipal = {
  id: "67ef02dc-814d-49e2-b6c2-9bdc433924c0",
  role: "MEMBER",
};
const MUTATION_VALUES: SupplierMutationValues = {
  name: "Printer @ Com 2",
  categories: ["PRINTING"],
  buildingCode: "COM2",
  floor: "1",
  locationDescription: "Next to LT19",
  latitude: 1.2938347,
  longitude: 103.7744572,
  hoursKind: "INTERVAL",
  opensAt: "00:00",
  closesAt: "23:59",
};

describe("SupplierController", () => {
  it("protects every controller route with the Supplier authentication guard", () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      SupplierController,
    ) as unknown[];

    expect(guards).toContain(SupplierAuthGuard);
  });

  it("delegates list using the guard-attached principal", async () => {
    const catalogue = createCatalogue();
    const administration = createAdministration();
    const page = { items: [], page: 0, size: 12, totalItems: 0, totalPages: 0 };
    catalogue.list.mockResolvedValue(page);
    const controller = new SupplierController(catalogue, administration);
    const query = { status: "ACTIVE" as const, page: 0, size: 12, sort: "name,asc" as const };

    await expect(controller.list(query, request())).resolves.toBe(page);
    expect(catalogue.list).toHaveBeenCalledWith(query, PRINCIPAL);
  });

  it("returns every backend-owned Building Code option to either authenticated role", () => {
    const controller = new SupplierController(
      createCatalogue(),
      createAdministration(),
    );

    expect(controller.metadata()).toEqual({ buildingCodes: BUILDING_OPTIONS });
    expect(
      Reflect.getMetadata(
        SUPPLIER_REQUIRED_ROLES,
        SupplierController.prototype.metadata,
      ),
    ).toBeUndefined();
  });

  it("returns detail and sets the exact strong version ETag", async () => {
    const catalogue = createCatalogue();
    const administration = createAdministration();
    const supplier = createSupplier();
    catalogue.get.mockResolvedValue(supplier);
    const response = { setHeader: jest.fn() };
    const controller = new SupplierController(catalogue, administration);

    await expect(
      controller.detail(SUPPLIER_ID, request(), response),
    ).resolves.toBe(supplier);
    expect(response.setHeader).toHaveBeenCalledWith("ETag", '"v7"');
  });

  it.each(["create", "update", "archive", "restore"] as const)(
    "marks %s ADMINISTRATOR-only without installing a second guard",
    (method) => {
      const handler = SupplierController.prototype[method];

      expect(Reflect.getMetadata(SUPPLIER_REQUIRED_ROLES, handler)).toEqual([
        "ADMINISTRATOR",
      ]);
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toBeUndefined();
    },
  );

  it("rejects MEMBER in the guard before invoking a mutation", async () => {
    const verifier = {
      verify: jest.fn().mockResolvedValue(PRINCIPAL),
    } as jest.Mocked<SessionVerifier>;
    const request = { headers: { authorization: "Bearer member-token" } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => SupplierController.prototype.create,
      getClass: () => SupplierController,
    } as unknown as ExecutionContext;
    const administration = createAdministration();
    const guard = new SupplierAuthGuard(verifier, new Reflector());

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(verifier.verify).toHaveBeenCalledTimes(1);
    expect(administration.create).not.toHaveBeenCalled();
  });

  it("returns create headers from the committed representation", async () => {
    const administration = createAdministration();
    const supplier = createSupplier();
    administration.create.mockResolvedValue(supplier);
    const response = { setHeader: jest.fn() };
    const controller = new SupplierController(
      createCatalogue(),
      administration,
    );

    await expect(
      controller.create(MUTATION_VALUES, response),
    ).resolves.toBe(supplier);
    expect(response.setHeader).toHaveBeenNthCalledWith(
      1,
      "Location",
      `/api/v1/suppliers/${SUPPLIER_ID}`,
    );
    expect(response.setHeader).toHaveBeenNthCalledWith(2, "ETag", '"v7"');
    expect(
      Reflect.getMetadata(
        HTTP_CODE_METADATA,
        SupplierController.prototype.create,
      ),
    ).toBe(201);
  });

  it("delegates full update and returns the committed ETag", async () => {
    const administration = createAdministration();
    const supplier = createSupplier();
    administration.update.mockResolvedValue(supplier);
    const response = { setHeader: jest.fn() };
    const controller = new SupplierController(
      createCatalogue(),
      administration,
    );

    await expect(
      controller.update(SUPPLIER_ID, '"v6"', MUTATION_VALUES, response),
    ).resolves.toBe(supplier);
    expect(administration.update).toHaveBeenCalledWith(
      SUPPLIER_ID,
      '"v6"',
      MUTATION_VALUES,
    );
    expect(response.setHeader).toHaveBeenCalledWith("ETag", '"v7"');
  });

  it("returns 204 for archive with no response body", async () => {
    const administration = createAdministration();
    administration.archive.mockResolvedValue(undefined);
    const controller = new SupplierController(
      createCatalogue(),
      administration,
    );

    await expect(
      controller.archive(SUPPLIER_ID, undefined),
    ).resolves.toBeUndefined();
    expect(administration.archive).toHaveBeenCalledWith(
      SUPPLIER_ID,
      undefined,
    );
    expect(
      Reflect.getMetadata(
        HTTP_CODE_METADATA,
        SupplierController.prototype.archive,
      ),
    ).toBe(204);
  });

  it("forces restore POST to 200 and returns its ETag", async () => {
    const administration = createAdministration();
    const supplier = createSupplier();
    administration.restore.mockResolvedValue(supplier);
    const response = { setHeader: jest.fn() };
    const controller = new SupplierController(
      createCatalogue(),
      administration,
    );

    await expect(
      controller.restore(SUPPLIER_ID, '"v6"', response),
    ).resolves.toBe(supplier);
    expect(response.setHeader).toHaveBeenCalledWith("ETag", '"v7"');
    expect(
      Reflect.getMetadata(
        HTTP_CODE_METADATA,
        SupplierController.prototype.restore,
      ),
    ).toBe(200);
  });
});

function createCatalogue(): jest.Mocked<SupplierCatalogueService> {
  return {
    list: jest.fn(),
    get: jest.fn(),
  } as unknown as jest.Mocked<SupplierCatalogueService>;
}

function createAdministration(): jest.Mocked<SupplierAdministrationService> {
  return {
    create: jest.fn(),
    update: jest.fn(),
    archive: jest.fn(),
    restore: jest.fn(),
  } as unknown as jest.Mocked<SupplierAdministrationService>;
}

function request(): AuthenticatedSupplierRequest {
  return { headers: {}, principal: PRINCIPAL };
}

function createSupplier(): SupplierReadModel {
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
    status: "ACTIVE",
    version: 7,
    createdAt: "2026-09-24T08:00:00.000Z",
    updatedAt: "2026-09-25T08:00:00.000Z",
    archivedAt: null,
  };
}
