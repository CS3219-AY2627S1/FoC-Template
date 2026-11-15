/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: tested deterministic parsing and approved mappings against the repository Supplier CSV.
 * Author review: Reviewed and approved by @ron.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  decodeSupplierSeedCsv,
  EXPECTED_SEED_ROW_COUNT,
  parseSupplierSeedCsv,
} from "./seed-parser";

describe("Supplier seed parser", () => {
  const csvPath = path.resolve(
    process.cwd(),
    "../data/csv/supplier-seed-data.csv",
  );
  const source = decodeSupplierSeedCsv(readFileSync(csvPath));
  const seeds = parseSupplierSeedCsv(source);

  it("maps all 21 source rows to stable, unique IDs", () => {
    expect(seeds).toHaveLength(EXPECTED_SEED_ROW_COUNT);
    expect(new Set(seeds.map(({ supplier }) => supplier.id)).size).toBe(
      EXPECTED_SEED_ROW_COUNT,
    );
    expect(findSeed("Printer @ Com 2").supplier.id).toBe(
      "ac2288df-661c-5d78-bcc1-ac6bca30fe51",
    );
  });

  it("retains a fixed ID when editable name and location text change", () => {
    const editedSource = source
      .replace(
        "Printer @ Com 2,Printing,Com 2,1,Next to LT19,",
        "Renamed printer,Printing,Com 2,1,Updated directions,",
      );
    const editedSeeds = parseSupplierSeedCsv(editedSource);

    expect(
      editedSeeds.find(({ supplier }) => supplier.name === "Renamed printer")
        ?.supplier.id,
    ).toBe("ac2288df-661c-5d78-bcc1-ac6bca30fe51");
  });

  it("assigns distinct fixed IDs to same-name rows", () => {
    const sameNameSource = source.replace(
      "NUS Co-op,Shopping",
      "Anna's x Soup Union,Shopping",
    );
    const sameNameSeeds = parseSupplierSeedCsv(sameNameSource).filter(
      ({ supplier }) => supplier.name === "Anna's x Soup Union",
    );

    expect(sameNameSeeds.map(({ supplier }) => supplier.id)).toEqual([
      "bdee8954-e570-58cf-a813-0ab36a084296",
      "5061f9ec-5fba-5119-888e-dfeeaefdb727",
    ]);
  });

  it("rejects reordered source rows instead of reassigning IDs", () => {
    const lines = source.split(/\r?\n/);
    [lines[1], lines[2]] = [lines[2], lines[1]];

    expect(() => parseSupplierSeedCsv(lines.join("\n"))).toThrow(
      /row 2: source identity does not match the durable manifest/,
    );
  });

  it("rejects a guarded source identity mismatch", () => {
    const mismatchedSource = source.replace("1.2938347", "1.2938348");

    expect(() => parseSupplierSeedCsv(mismatchedSource)).toThrow(
      /source identity does not match the durable manifest \(latitude\)/,
    );
  });

  it("normalizes buildings, categories, times, and bundled image paths", () => {
    const printer = findSeed("Printer @ Com 2");
    expect(printer.supplier).toMatchObject({
      buildingCode: "COM2",
      hoursKind: "INTERVAL",
      opensAt: "00:00",
      closesAt: "23:59",
      imagePath: "/assets/suppliers/PRINTER_COM2.jpeg",
    });
    expect(printer.categories).toEqual(["PRINTING"]);

    const robotCafe = findSeed("Cafe+ Robot Cafe");
    expect(robotCafe.categories).toEqual(["FOOD", "COFFEE"]);

    const octobox = findSeed("Octobox");
    expect(octobox.supplier.buildingCode).toBe("PGP");

    const supersnacks = findSeed("Supersnacks");
    expect(supersnacks.supplier).toMatchObject({
      opensAt: "11:00",
      closesAt: "02:00",
    });

    const heBrews = findSeed("he by He Brews");
    expect(heBrews.supplier.latitude).toBe("1.300566804");
  });

  function findSeed(name: string) {
    const seed = seeds.find(({ supplier }) => supplier.name === name);
    if (!seed) {
      throw new Error(`Missing test seed: ${name}`);
    }
    return seed;
  }
});
