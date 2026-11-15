/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-26.
 * Scope: centralized the validated editable Supplier value contract while
 * remediating the final review of issue #20.
 * Author review: Reviewed and approved by @ron.
 */
import {
  hoursKind as supplierHoursKind,
  SupplierCategory,
} from "../database/schema";
import { BuildingCode } from "../domain/buildings";

type SupplierHoursKind = (typeof supplierHoursKind.enumValues)[number];

export interface SupplierMutationValues {
  readonly name: string;
  readonly categories: readonly SupplierCategory[];
  readonly buildingCode: BuildingCode;
  readonly floor: string | null;
  readonly locationDescription: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly hoursKind: SupplierHoursKind;
  readonly opensAt: string | null;
  readonly closesAt: string | null;
}
