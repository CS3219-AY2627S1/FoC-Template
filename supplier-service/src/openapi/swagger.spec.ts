/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-26.
 * Scope: regression-tested the generated issue #25 Supplier OpenAPI contract.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-27; covered the
 * issue #33 metadata operation and schemas. Contract decision and
 * implementation reviewed and approved by @ron.
 */
import { INestApplication, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { SESSION_VERIFIER } from "../auth/session-verifier";
import { SupplierAuthGuard } from "../auth/supplier-auth.guard";
import { HealthController } from "../health/health.controller";
import { HealthService } from "../health/health.service";
import { SupplierAdministrationService } from "../suppliers/http/supplier-administration.service";
import { SupplierCatalogueService } from "../suppliers/http/supplier-catalogue.service";
import { SupplierIdentifierPipe } from "../suppliers/http/supplier-identifier.pipe";
import { SupplierListQueryPipe } from "../suppliers/http/supplier-list-query.pipe";
import { SupplierMutationBodyPipe } from "../suppliers/http/supplier-mutation-body.pipe";
import { SupplierController } from "../suppliers/http/supplier.controller";
import {
  createSupplierOpenApiDocument,
  SUPPLIER_BEARER_AUTH_NAME,
} from "./swagger";

@Module({
  controllers: [HealthController, SupplierController],
  providers: [
    SupplierIdentifierPipe,
    SupplierListQueryPipe,
    SupplierMutationBodyPipe,
    {
      provide: HealthService,
      useValue: { getReadiness: jest.fn() },
    },
    {
      provide: SupplierCatalogueService,
      useValue: { get: jest.fn(), list: jest.fn() },
    },
    {
      provide: SupplierAdministrationService,
      useValue: {
        archive: jest.fn(),
        create: jest.fn(),
        restore: jest.fn(),
        update: jest.fn(),
      },
    },
    {
      provide: SESSION_VERIFIER,
      useValue: { verify: jest.fn() },
    },
    SupplierAuthGuard,
  ],
})
class OpenApiTestModule {}

describe("Supplier OpenAPI document", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await NestFactory.create(OpenApiTestModule, {
      abortOnError: false,
      logger: false,
    });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("describes every implemented health and Supplier operation", () => {
    const document = createSupplierOpenApiDocument(app);

    expect(document.info).toMatchObject({
      title: "FoC Supplier Service API",
      version: "1.0.0",
    });
    expect(Object.keys(document.paths).sort()).toEqual([
      "/api/v1/suppliers",
      "/api/v1/suppliers/metadata",
      "/api/v1/suppliers/{id}",
      "/api/v1/suppliers/{id}/restore",
      "/health",
    ]);
    expect(Object.keys(document.paths["/api/v1/suppliers"] ?? {}).sort()).toEqual([
      "get",
      "post",
    ]);
    expect(
      Object.keys(document.paths["/api/v1/suppliers/{id}"] ?? {}).sort(),
    ).toEqual(["delete", "get", "put"]);
    expect(document.paths["/api/v1/suppliers/{id}/restore"]).toHaveProperty(
      "post",
    );
  });

  it("publishes bearer security without protecting health", () => {
    const document = createSupplierOpenApiDocument(app);

    expect(document.components?.securitySchemes).toHaveProperty(
      SUPPLIER_BEARER_AUTH_NAME,
      expect.objectContaining({ scheme: "bearer", type: "http" }),
    );
    expect(document.paths["/health"]?.get?.security).toBeUndefined();
    expect(document.paths["/api/v1/suppliers"]?.get?.security).toEqual([
      { [SUPPLIER_BEARER_AUTH_NAME]: [] },
    ]);
    expect(document.paths["/api/v1/suppliers/metadata"]?.get?.security).toEqual([
      { [SUPPLIER_BEARER_AUTH_NAME]: [] },
    ]);
  });

  it("documents list parameters and the full mutation/precondition contract", () => {
    const document = createSupplierOpenApiDocument(app);
    const list = document.paths["/api/v1/suppliers"]?.get;
    const create = document.paths["/api/v1/suppliers"]?.post;
    const update = document.paths["/api/v1/suppliers/{id}"]?.put;
    const archive = document.paths["/api/v1/suppliers/{id}"]?.delete;
    const restore = document.paths["/api/v1/suppliers/{id}/restore"]?.post;

    expect(list?.parameters?.map((parameter) =>
      "$ref" in parameter ? parameter.$ref : parameter.name,
    )).toEqual([
      "q",
      "buildingCode",
      "category",
      "status",
      "page",
      "size",
      "sort",
    ]);
    expect(create?.requestBody).toEqual(
      expect.objectContaining({ required: true }),
    );
    expect(create?.responses).toHaveProperty("201");
    expect(create?.responses).toHaveProperty("409");
    expect(update?.responses).toHaveProperty("412");
    expect(update?.responses).toHaveProperty("428");
    expect(restore?.responses).toHaveProperty("412");
    expect(restore?.responses).toHaveProperty("428");

    const updateIfMatch = update?.parameters?.find(
      (parameter) => !("$ref" in parameter) && parameter.name === "If-Match",
    );
    const archiveIfMatch = archive?.parameters?.find(
      (parameter) => !("$ref" in parameter) && parameter.name === "If-Match",
    );
    expect(updateIfMatch).toMatchObject({ required: true });
    expect(archiveIfMatch).toMatchObject({ required: false });
  });

  it("publishes reusable Supplier request, response, and error schemas", () => {
    const schemas = createSupplierOpenApiDocument(app).components?.schemas;

    expect(schemas).toHaveProperty("SupplierMutationRequestDto");
    expect(schemas).toHaveProperty("SupplierResponseDto");
    expect(schemas).toHaveProperty("SupplierListResponseDto");
    expect(schemas).toHaveProperty("SupplierBuildingOptionDto");
    expect(schemas).toHaveProperty("SupplierMetadataResponseDto");
    expect(schemas).toHaveProperty("SupplierErrorResponseDto");
    expect(schemas).toHaveProperty("HealthResponseDto");
    expect(schemas?.SupplierMutationRequestDto).toMatchObject({
      required: [
        "name",
        "categories",
        "buildingCode",
        "locationDescription",
        "hoursKind",
      ],
    });
    expect(schemas?.SupplierBuildingOptionDto).toMatchObject({
      required: ["code", "label"],
      properties: {
        code: {
          allOf: [{ $ref: "#/components/schemas/BuildingCode" }],
        },
        label: { type: "string" },
      },
    });
    expect(schemas?.SupplierMetadataResponseDto).toMatchObject({
      required: ["buildingCodes"],
      properties: {
        buildingCodes: {
          type: "array",
          items: { $ref: "#/components/schemas/SupplierBuildingOptionDto" },
        },
      },
    });
  });
});
