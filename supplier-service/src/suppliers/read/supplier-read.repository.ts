/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: defined the persistence boundary for Supplier catalogue list and detail reads.
 * Author review: Reviewed and approved by @ron.
 */
import {
  SupplierListPage,
  SupplierListQuery,
  SupplierReadModel,
  SupplierStatus,
} from "./supplier-read.types";

export abstract class SupplierReadRepository {
  abstract list(query: SupplierListQuery): Promise<SupplierListPage>;

  abstract findById(
    supplierId: string,
    status: SupplierStatus,
  ): Promise<SupplierReadModel | null>;
}
