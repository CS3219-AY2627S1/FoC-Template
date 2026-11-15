/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-26.
 * Scope: attached accurate issue #25 OpenAPI operations, parameters, response
 * codes, and access rules to the existing Supplier controller.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-27; documented the
 * authenticated issue #33 Supplier metadata operation.
 * Contract decision and implementation reviewed and approved by @ron.
 */
import { applyDecorators } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiPreconditionFailedResponse,
  ApiPreconditionRequiredResponse,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";

import { supplierCategory, supplierStatus } from "../database/schema";
import { BUILDING_CODES } from "../domain/buildings";
import {
  SupplierErrorResponseDto,
  SupplierListResponseDto,
  SupplierMetadataResponseDto,
  SupplierMutationRequestDto,
  SupplierResponseDto,
} from "./supplier-api.dto";
import { SUPPLIER_BEARER_AUTH_NAME } from "./swagger";

const requestIdHeader = {
  "X-Request-Id": {
    description: "Server-generated request correlation identifier.",
    schema: { format: "uuid", type: "string" },
  },
};

const etagHeader = {
  ETag: {
    description: "Canonical strong Supplier version tag.",
    schema: { example: '"v0"', type: "string" },
  },
  ...requestIdHeader,
};

const supplierIdParameter = {
  description: "Permanent Supplier Identifier.",
  format: "uuid",
  name: "id",
  type: String,
} as const;

const requiredIfMatchHeader = {
  description:
    'Current canonical strong Supplier ETag, for example "v3". Weak, wildcard, list, unquoted, and leading-zero forms are rejected.',
  name: "If-Match",
  required: true,
  schema: { example: '"v3"', type: "string" },
} as const;

const supplierErrorResponse = {
  headers: requestIdHeader,
  type: SupplierErrorResponseDto,
};

export function ApiSupplierController(): ClassDecorator {
  return applyDecorators(
    ApiTags("Suppliers"),
    ApiBearerAuth(SUPPLIER_BEARER_AUTH_NAME),
    ApiUnauthorizedResponse({
      ...supplierErrorResponse,
      description: "Bearer token is missing, invalid, or expired.",
    }),
    ApiServiceUnavailableResponse({
      ...supplierErrorResponse,
      description: "User Service verification is temporarily unavailable.",
    }),
  );
}

export function ApiGetSupplierMetadata(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: "Get Supplier metadata",
      description:
        "MEMBER and ADMINISTRATOR may retrieve the complete backend-owned Building Code option set.",
    }),
    ApiOkResponse({
      description: "Canonical Building Codes and their display labels.",
      headers: requestIdHeader,
      type: SupplierMetadataResponseDto,
    }),
  );
}

export function ApiListSuppliers(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: "List Suppliers",
      description:
        "MEMBER and ADMINISTRATOR may list ACTIVE Suppliers. Only ADMINISTRATOR may request ARCHIVED Suppliers.",
    }),
    ApiQuery({
      description:
        "Trimmed, case-insensitive Supplier name and Location Description search.",
      maxLength: 300,
      name: "q",
      required: false,
      type: String,
    }),
    ApiQuery({
      enum: BUILDING_CODES,
      enumName: "BuildingCode",
      name: "buildingCode",
      required: false,
    }),
    ApiQuery({
      enum: supplierCategory.enumValues,
      enumName: "SupplierCategory",
      name: "category",
      required: false,
    }),
    ApiQuery({
      default: "ACTIVE",
      enum: supplierStatus.enumValues,
      enumName: "SupplierStatus",
      name: "status",
      required: false,
    }),
    ApiQuery({ default: 0, minimum: 0, name: "page", required: false, type: Number }),
    ApiQuery({
      default: 12,
      maximum: 100,
      minimum: 1,
      name: "size",
      required: false,
      type: Number,
    }),
    ApiQuery({
      default: "name,asc",
      enum: ["name,asc", "name,desc", "updatedAt,desc"],
      name: "sort",
      required: false,
    }),
    ApiOkResponse({
      description: "One stable page of matching Suppliers.",
      headers: requestIdHeader,
      type: SupplierListResponseDto,
    }),
    ApiBadRequestResponse({
      ...supplierErrorResponse,
      description: "One or more query parameters are invalid.",
    }),
    ApiForbiddenResponse({
      ...supplierErrorResponse,
      description: "A MEMBER attempted to list ARCHIVED Suppliers.",
    }),
  );
}

export function ApiGetSupplier(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: "Get one Supplier",
      description:
        "Returns an ACTIVE Supplier to either role or an ARCHIVED Supplier to ADMINISTRATOR. Archived entries are concealed from MEMBER as not found.",
    }),
    ApiParam(supplierIdParameter),
    ApiOkResponse({
      description: "Supplier representation and its current strong ETag.",
      headers: etagHeader,
      type: SupplierResponseDto,
    }),
    ApiBadRequestResponse({
      ...supplierErrorResponse,
      description: "The Supplier Identifier is not a canonical UUID.",
    }),
    ApiNotFoundResponse({
      ...supplierErrorResponse,
      description: "Supplier does not exist or is archived and concealed from MEMBER.",
    }),
  );
}

export function ApiCreateSupplier(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: "Create a Supplier",
      description: "ADMINISTRATOR-only. Creates an ACTIVE version-zero Supplier.",
    }),
    ApiBody({ required: true, type: SupplierMutationRequestDto }),
    ApiCreatedResponse({
      description: "Supplier created.",
      headers: {
        ...etagHeader,
        Location: {
          description: "Relative URL of the created Supplier.",
          schema: {
            example: "/api/v1/suppliers/ac2288df-661c-5d78-bcc1-ac6bca30fe51",
            type: "string",
          },
        },
      },
      type: SupplierResponseDto,
    }),
    ApiBadRequestResponse({
      ...supplierErrorResponse,
      description: "The strict Supplier body is invalid.",
    }),
    ApiForbiddenResponse({
      ...supplierErrorResponse,
      description: "The verified user is not an ADMINISTRATOR.",
    }),
    ApiConflictResponse({
      ...supplierErrorResponse,
      description: "An ACTIVE or ARCHIVED Supplier has the same normalized identity.",
    }),
  );
}

export function ApiUpdateSupplier(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: "Fully update a Supplier",
      description:
        "ADMINISTRATOR-only. Replaces every editable field while preserving ACTIVE or ARCHIVED lifecycle state.",
    }),
    ApiParam(supplierIdParameter),
    ApiHeader(requiredIfMatchHeader),
    ApiBody({ required: true, type: SupplierMutationRequestDto }),
    ApiOkResponse({
      description: "Supplier updated and version advanced.",
      headers: etagHeader,
      type: SupplierResponseDto,
    }),
    ...mutationErrorDecorators(),
  );
}

export function ApiArchiveSupplier(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: "Archive a Supplier",
      description:
        "ADMINISTRATOR-only. Retains the Supplier row and ID. If already ARCHIVED, returns 204 without mutation and ignores If-Match; otherwise the current ETag is required.",
    }),
    ApiParam(supplierIdParameter),
    ApiHeader({
      ...requiredIfMatchHeader,
      required: false,
    }),
    ApiNoContentResponse({
      description: "Supplier is archived; response body is empty.",
      headers: requestIdHeader,
    }),
    ...mutationErrorDecorators(),
  );
}

export function ApiRestoreSupplier(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: "Restore a Supplier",
      description:
        "ADMINISTRATOR-only. Restores the same Supplier row and ID. Repeating restore with the current ETag is a representation-preserving no-op.",
    }),
    ApiParam(supplierIdParameter),
    ApiHeader(requiredIfMatchHeader),
    ApiOkResponse({
      description: "Supplier is ACTIVE and retains its permanent identifier.",
      headers: etagHeader,
      type: SupplierResponseDto,
    }),
    ...mutationErrorDecorators(),
  );
}

function mutationErrorDecorators(): MethodDecorator[] {
  return [
    ApiBadRequestResponse({
      ...supplierErrorResponse,
      description: "Supplier body, identifier, or If-Match syntax is invalid.",
    }),
    ApiForbiddenResponse({
      ...supplierErrorResponse,
      description: "The verified user is not an ADMINISTRATOR.",
    }),
    ApiNotFoundResponse({
      ...supplierErrorResponse,
      description: "The Supplier does not exist.",
    }),
    ApiPreconditionFailedResponse({
      ...supplierErrorResponse,
      description: "The supplied canonical ETag is stale.",
    }),
    ApiPreconditionRequiredResponse({
      ...supplierErrorResponse,
      description: "The operation requires the current Supplier ETag.",
    }),
  ];
}
