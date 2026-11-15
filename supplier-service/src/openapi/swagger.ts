/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-26.
 * Scope: configured the issue #25 Supplier OpenAPI document, Swagger UI, JSON
 * endpoint, and bearer-token security scheme. Author review: Reviewed and approved by @ron.
 */
import { INestApplication } from "@nestjs/common";
import {
  DocumentBuilder,
  OpenAPIObject,
  SwaggerModule,
} from "@nestjs/swagger";

export const SUPPLIER_OPENAPI_UI_PATH = "api/docs";
export const SUPPLIER_OPENAPI_JSON_PATH = "api/docs-json";
export const SUPPLIER_BEARER_AUTH_NAME = "supplier-bearer";

const supplierOpenApiConfiguration = new DocumentBuilder()
  .setTitle("FoC Supplier Service API")
  .setDescription(
    "Backend API for authenticated Supplier catalogue reads and administrator-managed Supplier lifecycle operations. Obtain a bearer token from User Service before using protected operations.",
  )
  .setVersion("1.0.0")
  .addTag("Health", "Database-backed Supplier Service readiness")
  .addTag("Suppliers", "Supplier catalogue reads and administrator mutations")
  .addBearerAuth(
    {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
      description:
        "User Service access token. Enter the token only; Swagger UI adds the Bearer prefix.",
    },
    SUPPLIER_BEARER_AUTH_NAME,
  )
  .build();

export function createSupplierOpenApiDocument(
  app: INestApplication,
): OpenAPIObject {
  return SwaggerModule.createDocument(app, supplierOpenApiConfiguration, {
    operationIdFactory: (_controllerKey, methodKey) => methodKey,
  });
}

export function configureSupplierOpenApi(app: INestApplication): void {
  const documentFactory = () => createSupplierOpenApiDocument(app);
  SwaggerModule.setup(SUPPLIER_OPENAPI_UI_PATH, app, documentFactory, {
    customSiteTitle: "FoC Supplier Service API",
    jsonDocumentUrl: SUPPLIER_OPENAPI_JSON_PATH,
  });
}
