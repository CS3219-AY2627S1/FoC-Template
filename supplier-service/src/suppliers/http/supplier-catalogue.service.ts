/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: enforced MEMBER and ADMINISTRATOR catalogue visibility for Supplier
 * list/detail reads and adopted shared public errors in issue #17.
 * Author review: Reviewed and approved by @ron.
 */
import { Injectable } from "@nestjs/common";

import { VerifiedPrincipal } from "../../auth/session-verifier";
import {
  supplierForbiddenException,
  supplierNotFoundException,
} from "../../http/supplier-http-errors";
import { SupplierReadService } from "../read/supplier-read.service";
import {
  SupplierListPage,
  SupplierListQuery,
  SupplierReadModel,
} from "../read/supplier-read.types";

@Injectable()
export class SupplierCatalogueService {
  constructor(private readonly reads: SupplierReadService) {}

  list(
    query: SupplierListQuery,
    principal: VerifiedPrincipal,
  ): Promise<SupplierListPage> {
    if (query.status === "ARCHIVED" && principal.role !== "ADMINISTRATOR") {
      throw supplierForbiddenException(
        "Only administrators may browse archived Suppliers.",
      );
    }
    return this.reads.list(query);
  }

  async get(
    supplierId: string,
    principal: VerifiedPrincipal,
  ): Promise<SupplierReadModel> {
    const active = await this.reads.findById(supplierId, "ACTIVE");
    if (active !== null) {
      return active;
    }

    if (principal.role === "ADMINISTRATOR") {
      const archived = await this.reads.findById(supplierId, "ARCHIVED");
      if (archived !== null) {
        return archived;
      }
    }

    throw supplierNotFoundException();
  }
}
