/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-26.
 * Scope: defined the persistence outcomes for the approved Supplier mutation contract.
 * Author review: Reviewed and approved by @ron.
 */
import { SupplierReadModel } from "../read/supplier-read.types";

export type CreateSupplierResult =
  | {
      readonly kind: "created";
      readonly supplier: SupplierReadModel;
    }
  | {
      readonly kind: "duplicate";
      readonly existingSupplierId: string;
    };

export type UpdateSupplierResult =
  | {
      readonly kind: "updated";
      readonly supplier: SupplierReadModel;
    }
  | {
      readonly kind: "not-found" | "stale";
    };

export type ArchiveSupplierResult =
  | {
      readonly kind: "archived" | "already-archived";
    }
  | {
      readonly kind: "not-found" | "precondition-required" | "stale";
    };

export type RestoreSupplierResult =
  | {
      readonly kind: "restored" | "already-active";
      readonly supplier: SupplierReadModel;
    }
  | {
      readonly kind: "not-found" | "stale";
    };
