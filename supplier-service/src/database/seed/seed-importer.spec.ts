/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: verified repeatable seed imports skip existing IDs and preserve administrator edits.
 * Author review: Reviewed and approved by @ron.
 */
import {
  importSeedSuppliers,
  SeedStore,
} from "./seed-importer";
import { SeedSupplier } from "./seed-parser";

describe("Supplier seed importer", () => {
  it("is repeatable and does not overwrite an administrator edit", async () => {
    const store = new MemorySeedStore();
    const seed = createSeed();

    await expect(importSeedSuppliers([seed], store)).resolves.toEqual({
      inserted: 1,
      skipped: 0,
    });

    store.rename(seed.supplier.id, "Administrator-edited name");

    await expect(importSeedSuppliers([seed], store)).resolves.toEqual({
      inserted: 0,
      skipped: 1,
    });
    expect(store.get(seed.supplier.id)?.supplier.name).toBe(
      "Administrator-edited name",
    );
  });
});

class MemorySeedStore implements SeedStore {
  private readonly rows = new Map<string, SeedSupplier>();

  async insertIfAbsent(seed: SeedSupplier): Promise<boolean> {
    if (this.rows.has(seed.supplier.id)) {
      return false;
    }
    this.rows.set(seed.supplier.id, structuredClone(seed));
    return true;
  }

  rename(id: string, name: string): void {
    const row = this.rows.get(id);
    if (!row) {
      throw new Error(`Unknown Supplier seed ID: ${id}`);
    }
    row.supplier.name = name;
  }

  get(id: string): SeedSupplier | undefined {
    return this.rows.get(id);
  }
}

function createSeed(): SeedSupplier {
  return {
    supplier: {
      id: "70f78786-0bec-5d26-a2ac-8ef4f7252391",
      name: "Original seed name",
      buildingCode: "COM2",
      floor: "1",
      locationDescription: "Next to the lecture theatre",
      latitude: "1.2938347",
      longitude: "103.7744572",
      hoursKind: "INTERVAL",
      opensAt: "09:00",
      closesAt: "18:00",
      imagePath: null,
      status: "ACTIVE",
      version: 0,
    },
    categories: ["PRINTING"],
  };
}
