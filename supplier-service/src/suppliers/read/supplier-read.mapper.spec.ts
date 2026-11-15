/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: tested complete Supplier catalogue mapping, canonical building labels, coordinates, hours, and archive fields.
 * Author review: Reviewed and approved by @ron.
 */
import { mapSupplierReadModel, SupplierDatabaseRow } from "./supplier-read.mapper";

describe("Supplier read mapper", () => {
  it("maps a database row to the complete catalogue representation", () => {
    const row: SupplierDatabaseRow = {
      id: "ac2288df-661c-5d78-bcc1-ac6bca30fe51",
      name: "Printer @ Com 2",
      buildingCode: "COM2",
      floor: "1",
      locationDescription: "Next to LT19",
      latitude: "1.2938347",
      longitude: "103.7744572",
      hoursKind: "INTERVAL",
      opensAt: "00:00:00",
      closesAt: "23:59:00",
      imagePath: "/assets/suppliers/PRINTER_COM2.jpeg",
      status: "ARCHIVED",
      version: 3,
      createdAt: new Date("2026-09-24T08:00:00.000Z"),
      updatedAt: new Date("2026-09-25T08:00:00.000Z"),
      archivedAt: new Date("2026-09-25T09:00:00.000Z"),
    };

    expect(mapSupplierReadModel(row, ["PRINTING"])).toEqual({
      id: "ac2288df-661c-5d78-bcc1-ac6bca30fe51",
      name: "Printer @ Com 2",
      categories: ["PRINTING"],
      buildingCode: "COM2",
      buildingLabel: "COM2",
      floor: "1",
      locationDescription: "Next to LT19",
      latitude: 1.2938347,
      longitude: 103.7744572,
      hoursKind: "INTERVAL",
      opensAt: "00:00",
      closesAt: "23:59",
      imagePath: "/assets/suppliers/PRINTER_COM2.jpeg",
      status: "ARCHIVED",
      version: 3,
      createdAt: "2026-09-24T08:00:00.000Z",
      updatedAt: "2026-09-25T08:00:00.000Z",
      archivedAt: "2026-09-25T09:00:00.000Z",
    });
  });

  it("retains null optional fields for an unknown-hours Supplier", () => {
    const row: SupplierDatabaseRow = {
      id: "70f78786-0bec-5d26-a2ac-8ef4f7252391",
      name: "Pickup foyer",
      buildingCode: "CENTRAL_LIBRARY",
      floor: null,
      locationDescription: "Main entrance foyer",
      latitude: null,
      longitude: null,
      hoursKind: "UNKNOWN",
      opensAt: null,
      closesAt: null,
      imagePath: null,
      status: "ACTIVE",
      version: 0,
      createdAt: new Date("2026-09-24T08:00:00.000Z"),
      updatedAt: new Date("2026-09-24T08:00:00.000Z"),
      archivedAt: null,
    };

    expect(mapSupplierReadModel(row, ["PICKUP_POINT"])).toMatchObject({
      buildingLabel: "Central Library",
      latitude: null,
      longitude: null,
      opensAt: null,
      closesAt: null,
      archivedAt: null,
    });
  });
});
