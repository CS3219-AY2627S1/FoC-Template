/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: implemented insert-only repeatable seed semantics that preserve administrator edits.
 * Author review: Reviewed and approved by @ron.
 */
import { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "../schema";
import { supplierCategories, suppliers } from "../schema";
import { SeedSupplier } from "./seed-parser";

export interface SeedStore {
  insertIfAbsent(seed: SeedSupplier): Promise<boolean>;
}

export interface SeedImportResult {
  inserted: number;
  skipped: number;
}

export class PostgresSeedStore implements SeedStore {
  constructor(private readonly database: NodePgDatabase<typeof schema>) {}

  async insertIfAbsent(seed: SeedSupplier): Promise<boolean> {
    return this.database.transaction(async (transaction) => {
      const inserted = await transaction
        .insert(suppliers)
        .values(seed.supplier)
        .onConflictDoNothing({ target: suppliers.id })
        .returning({ id: suppliers.id });

      if (inserted.length === 0) {
        return false;
      }

      await transaction.insert(supplierCategories).values(
        seed.categories.map((category) => ({
          supplierId: seed.supplier.id,
          category,
        })),
      );

      return true;
    });
  }
}

export async function importSeedSuppliers(
  seeds: readonly SeedSupplier[],
  store: SeedStore,
): Promise<SeedImportResult> {
  let inserted = 0;

  for (const seed of seeds) {
    if (await store.insertIfAbsent(seed)) {
      inserted += 1;
    }
  }

  return { inserted, skipped: seeds.length - inserted };
}
