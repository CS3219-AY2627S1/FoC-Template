/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: implemented PostgreSQL-backed Supplier list/detail retrieval without duplicate rows or counts from categories.
 * Author review: Reviewed and approved by @ron.
 */
import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../../database/database.service";
import { SupplierCategory } from "../../database/schema";
import {
  buildSupplierCategoriesQuery,
  buildSupplierCountQuery,
  buildSupplierDetailQuery,
  buildSupplierPageQuery,
} from "./drizzle-supplier-read.queries";
import { mapSupplierReadModel } from "./supplier-read.mapper";
import { SupplierReadRepository } from "./supplier-read.repository";
import {
  SupplierListPage,
  SupplierListQuery,
  SupplierReadModel,
  SupplierStatus,
} from "./supplier-read.types";

@Injectable()
export class DrizzleSupplierReadRepository extends SupplierReadRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async list(query: SupplierListQuery): Promise<SupplierListPage> {
    const [rows, totals] = await Promise.all([
      buildSupplierPageQuery(this.database.client, query),
      buildSupplierCountQuery(this.database.client, query),
    ]);
    const categoriesBySupplier = await this.loadCategories(
      rows.map(({ id }) => id),
    );
    const totalItems = totals[0]?.totalItems ?? 0;

    return {
      items: rows.map((row) =>
        mapSupplierReadModel(row, categoriesBySupplier.get(row.id) ?? []),
      ),
      page: query.page,
      size: query.size,
      totalItems,
      totalPages: Math.ceil(totalItems / query.size),
    };
  }

  async findById(
    supplierId: string,
    status: SupplierStatus,
  ): Promise<SupplierReadModel | null> {
    const [row] = await buildSupplierDetailQuery(
      this.database.client,
      supplierId,
      status,
    );
    if (row === undefined) {
      return null;
    }

    const categoriesBySupplier = await this.loadCategories([row.id]);
    return mapSupplierReadModel(
      row,
      categoriesBySupplier.get(row.id) ?? [],
    );
  }

  private async loadCategories(
    supplierIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly SupplierCategory[]>> {
    if (supplierIds.length === 0) {
      return new Map();
    }

    const rows = await buildSupplierCategoriesQuery(
      this.database.client,
      supplierIds,
    );
    const categoriesBySupplier = new Map<string, SupplierCategory[]>();
    for (const { supplierId, category } of rows) {
      const categories = categoriesBySupplier.get(supplierId) ?? [];
      categories.push(category);
      categoriesBySupplier.set(supplierId, categories);
    }
    return categoriesBySupplier;
  }
}
