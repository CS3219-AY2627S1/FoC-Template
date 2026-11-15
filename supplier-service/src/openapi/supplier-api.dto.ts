/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-26.
 * Scope: described the implemented Supplier HTTP request and response models
 * for the issue #25 OpenAPI document. Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-27; described the
 * issue #33 Building Code metadata response. Contract decision and
 * implementation reviewed and approved by @ron.
 */
import {
  ApiProperty,
  ApiPropertyOptional,
  ApiSchema,
} from "@nestjs/swagger";

import {
  hoursKind,
  supplierCategory,
  supplierStatus,
} from "../database/schema";
import { BUILDING_CODES } from "../domain/buildings";

@ApiSchema({
  description:
    "Editable Supplier fields accepted by create and full-update operations. Unknown properties are rejected.",
})
export class SupplierMutationRequestDto {
  @ApiProperty({
    description: "Displayed Supplier name.",
    example: "Printer @ COM2",
    maxLength: 120,
  })
  readonly name!: string;

  @ApiProperty({
    description: "One or more unique controlled Supplier categories.",
    enum: supplierCategory.enumValues,
    enumName: "SupplierCategory",
    example: ["PRINTING", "PICKUP_POINT"],
    isArray: true,
  })
  readonly categories!: string[];

  @ApiProperty({
    description: "Canonical campus Building Code.",
    enum: BUILDING_CODES,
    enumName: "BuildingCode",
    example: "COM2",
  })
  readonly buildingCode!: string;

  @ApiPropertyOptional({
    description: "Floor or level. Omission, null, and blank text become null.",
    example: "1",
    maxLength: 20,
    nullable: true,
    type: String,
  })
  readonly floor?: string | null;

  @ApiProperty({
    description:
      "The Supplier's only displayed description, including directions within or around its building.",
    example: "Next to LT19",
    maxLength: 300,
  })
  readonly locationDescription!: string;

  @ApiPropertyOptional({
    description: "Latitude. Latitude and longitude must be supplied together.",
    example: 1.2938347,
    maximum: 90,
    minimum: -90,
    nullable: true,
    type: Number,
  })
  readonly latitude?: number | null;

  @ApiPropertyOptional({
    description: "Longitude. Latitude and longitude must be supplied together.",
    example: 103.7744572,
    maximum: 180,
    minimum: -180,
    nullable: true,
    type: Number,
  })
  readonly longitude?: number | null;

  @ApiProperty({
    description:
      "How to interpret typical hours. INTERVAL requires opensAt and closesAt; other values require both to be null or omitted.",
    enum: hoursKind.enumValues,
    enumName: "SupplierHoursKind",
    example: "INTERVAL",
  })
  readonly hoursKind!: string;

  @ApiPropertyOptional({
    description: "Opening time in 24-hour HH:mm form for INTERVAL hours.",
    example: "09:00",
    nullable: true,
    pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$",
    type: String,
  })
  readonly opensAt?: string | null;

  @ApiPropertyOptional({
    description: "Closing time in 24-hour HH:mm form for INTERVAL hours.",
    example: "18:00",
    nullable: true,
    pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$",
    type: String,
  })
  readonly closesAt?: string | null;
}

@ApiSchema({
  description: "API representation of one Supplier catalogue entry.",
})
export class SupplierResponseDto {
  @ApiProperty({ format: "uuid" })
  readonly id!: string;

  @ApiProperty({ example: "Printer @ COM2", maxLength: 120 })
  readonly name!: string;

  @ApiProperty({
    enum: supplierCategory.enumValues,
    enumName: "SupplierCategory",
    isArray: true,
  })
  readonly categories!: string[];

  @ApiProperty({
    enum: BUILDING_CODES,
    enumName: "BuildingCode",
    example: "COM2",
  })
  readonly buildingCode!: string;

  @ApiProperty({ example: "COM2" })
  readonly buildingLabel!: string;

  @ApiProperty({ example: "1", nullable: true, type: String })
  readonly floor!: string | null;

  @ApiProperty({ example: "Next to LT19", maxLength: 300 })
  readonly locationDescription!: string;

  @ApiProperty({ example: 1.2938347, nullable: true, type: Number })
  readonly latitude!: number | null;

  @ApiProperty({ example: 103.7744572, nullable: true, type: Number })
  readonly longitude!: number | null;

  @ApiProperty({
    enum: hoursKind.enumValues,
    enumName: "SupplierHoursKind",
  })
  readonly hoursKind!: string;

  @ApiProperty({ example: "09:00", nullable: true, type: String })
  readonly opensAt!: string | null;

  @ApiProperty({ example: "18:00", nullable: true, type: String })
  readonly closesAt!: string | null;

  @ApiProperty({
    example: "/assets/suppliers/printer-com2.jpg",
    nullable: true,
    type: String,
  })
  readonly imagePath!: string | null;

  @ApiProperty({
    enum: supplierStatus.enumValues,
    enumName: "SupplierStatus",
  })
  readonly status!: string;

  @ApiProperty({ example: 0, minimum: 0 })
  readonly version!: number;

  @ApiProperty({ format: "date-time" })
  readonly createdAt!: string;

  @ApiProperty({ format: "date-time" })
  readonly updatedAt!: string;

  @ApiProperty({ format: "date-time", nullable: true, type: String })
  readonly archivedAt!: string | null;
}

@ApiSchema({ description: "One page of Supplier catalogue entries." })
export class SupplierListResponseDto {
  @ApiProperty({ type: [SupplierResponseDto] })
  readonly items!: SupplierResponseDto[];

  @ApiProperty({ example: 0, minimum: 0 })
  readonly page!: number;

  @ApiProperty({ example: 12, maximum: 100, minimum: 1 })
  readonly size!: number;

  @ApiProperty({ example: 21, minimum: 0 })
  readonly totalItems!: number;

  @ApiProperty({ example: 2, minimum: 0 })
  readonly totalPages!: number;
}

@ApiSchema({ description: "One canonical Supplier Building Code option." })
export class SupplierBuildingOptionDto {
  @ApiProperty({
    description: "Canonical Building Code accepted by Supplier requests.",
    enum: BUILDING_CODES,
    enumName: "BuildingCode",
    example: "CENTRAL_LIBRARY",
  })
  readonly code!: string;

  @ApiProperty({
    description: "Backend-owned display label for the Building Code.",
    example: "Central Library",
  })
  readonly label!: string;
}

@ApiSchema({
  description: "Stable frontend metadata owned by Supplier Service.",
})
export class SupplierMetadataResponseDto {
  @ApiProperty({ type: [SupplierBuildingOptionDto] })
  readonly buildingCodes!: SupplierBuildingOptionDto[];
}

@ApiSchema({
  description: "Stable Supplier Service error envelope.",
})
export class SupplierErrorResponseDto {
  @ApiProperty({ example: "SUPPLIER_VALIDATION_FAILED" })
  readonly code!: string;

  @ApiProperty({ example: "Please correct the Supplier details." })
  readonly message!: string;

  @ApiPropertyOptional({
    additionalProperties: { type: "string" },
    example: { name: "Name is required." },
    type: "object",
  })
  readonly fieldErrors?: Readonly<Record<string, string>>;

  @ApiPropertyOptional({ format: "uuid" })
  readonly existingSupplierId?: string;

  @ApiProperty({ format: "uuid" })
  readonly requestId!: string;
}

@ApiSchema({ description: "Database-backed readiness result." })
export class HealthResponseDto {
  @ApiProperty({ enum: ["ok"], example: "ok" })
  readonly status!: "ok";
}
