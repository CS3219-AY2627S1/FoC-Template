/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: implemented the normalized Supplier catalogue list/detail query service.
 * Author review: Reviewed and approved by @ron.
 */
import { Injectable } from "@nestjs/common";

import { SupplierReadRepository } from "./supplier-read.repository";
import {
  SupplierListPage,
  SupplierListQuery,
  SupplierReadModel,
  SupplierStatus,
} from "./supplier-read.types";

@Injectable()
export class SupplierReadService {
  constructor(private readonly repository: SupplierReadRepository) {}

  list(query: SupplierListQuery): Promise<SupplierListPage> {
    const q = query.q?.trim();
    return this.repository.list({
      q: q === "" ? undefined : q,
      buildingCode: query.buildingCode,
      category: query.category,
      status: query.status,
      page: query.page,
      size: query.size,
      sort: query.sort,
    });
  }

  findById(
    supplierId: string,
    status: SupplierStatus,
  ): Promise<SupplierReadModel | null> {
    return this.repository.findById(supplierId, status);
  }
}
