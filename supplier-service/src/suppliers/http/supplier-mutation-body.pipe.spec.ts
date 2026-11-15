/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-26.
 * Scope: tested the author-approved strict create/full-update Supplier body
 * validation, bounds, conditional fields, and normalization for issue #20.
 * Author review: Reviewed and approved by @ron.
 */
import { BadRequestException } from "@nestjs/common";

import {
  parseSupplierMutationBody,
  SUPPLIER_FLOOR_MAX_LENGTH,
  SUPPLIER_LOCATION_DESCRIPTION_MAX_LENGTH,
  SUPPLIER_NAME_MAX_LENGTH,
} from "./supplier-mutation-body.pipe";

describe("parseSupplierMutationBody", () => {
  it("normalizes one strict create/full-update contract", () => {
    expect(
      parseSupplierMutationBody({
        name: "  Café Déjà Vu  ",
        categories: [" FOOD ", "COFFEE"],
        buildingCode: " COM2 ",
        floor: "  1  ",
        locationDescription: "  Next to LT19  ",
        latitude: 1.2938347,
        longitude: 103.7744572,
        hoursKind: " INTERVAL ",
        opensAt: " 09:00 ",
        closesAt: " 02:00 ",
      }),
    ).toEqual({
      name: "Café Déjà Vu",
      categories: ["FOOD", "COFFEE"],
      buildingCode: "COM2",
      floor: "1",
      locationDescription: "Next to LT19",
      latitude: 1.2938347,
      longitude: 103.7744572,
      hoursKind: "INTERVAL",
      opensAt: "09:00",
      closesAt: "02:00",
    });
  });

  it.each([
    [{}, null],
    [{ floor: null, latitude: null, longitude: null }, null],
    [{ floor: " \t ", latitude: null, longitude: null }, null],
  ] as const)(
    "normalizes omitted, explicit-null, and blank optional fields %#",
    (optionals, expectedFloor) => {
      expect(
        parseSupplierMutationBody({ ...validBody(), ...optionals }),
      ).toMatchObject({
        floor: expectedFloor,
        latitude: null,
        longitude: null,
      });
    },
  );

  it("accepts inclusive text and coordinate boundaries by Unicode character", () => {
    const parsed = parseSupplierMutationBody({
      ...validBody(),
      name: "💡".repeat(SUPPLIER_NAME_MAX_LENGTH),
      floor: "层".repeat(SUPPLIER_FLOOR_MAX_LENGTH),
      locationDescription: "é".repeat(
        SUPPLIER_LOCATION_DESCRIPTION_MAX_LENGTH,
      ),
      latitude: -90,
      longitude: 180,
    });

    expect(Array.from(parsed.name)).toHaveLength(SUPPLIER_NAME_MAX_LENGTH);
    expect(Array.from(parsed.floor ?? "")).toHaveLength(
      SUPPLIER_FLOOR_MAX_LENGTH,
    );
    expect(Array.from(parsed.locationDescription)).toHaveLength(
      SUPPLIER_LOCATION_DESCRIPTION_MAX_LENGTH,
    );
    expect(parsed.latitude).toBe(-90);
    expect(parsed.longitude).toBe(180);
  });

  it.each([
    ["name", "💡".repeat(SUPPLIER_NAME_MAX_LENGTH + 1)],
    ["floor", "层".repeat(SUPPLIER_FLOOR_MAX_LENGTH + 1)],
    [
      "locationDescription",
      "é".repeat(SUPPLIER_LOCATION_DESCRIPTION_MAX_LENGTH + 1),
    ],
  ] as const)("rejects an oversized %s", (field, value) => {
    expectFieldError({ ...validBody(), [field]: value }, field);
  });

  it.each([
    ["name", "   "],
    ["name", null],
    ["categories", []],
    ["categories", ["FOOD", " FOOD "]],
    ["categories", ["BOOKS"]],
    ["categories", ["FOOD", 1]],
    ["buildingCode", "COM1"],
    ["locationDescription", "\t"],
    ["hoursKind", "WEEKDAYS"],
  ] as const)("rejects invalid required field %s case %#", (field, value) => {
    expectFieldError({ ...validBody(), [field]: value }, field);
  });

  it.each([
    [{ latitude: 1.2, longitude: null }, ["latitude", "longitude"]],
    [{ latitude: null, longitude: 103.7 }, ["latitude", "longitude"]],
    [{ latitude: -90.1, longitude: 103.7 }, ["latitude"]],
    [{ latitude: 1.2, longitude: 180.1 }, ["longitude"]],
    [{ latitude: "1.2", longitude: 103.7 }, ["latitude"]],
    [{ latitude: Number.NaN, longitude: 103.7 }, ["latitude"]],
  ] as const)("rejects invalid coordinate case %#", (coordinates, fields) => {
    expectFieldErrors({ ...validBody(), ...coordinates }, fields);
  });

  it.each(["UNKNOWN", "ALL_DAY"] as const)(
    "accepts %s only when interval times are omitted",
    (hoursKind) => {
      expect(
        parseSupplierMutationBody({ ...validBodyWithoutTimes(), hoursKind }),
      ).toMatchObject({ hoursKind, opensAt: null, closesAt: null });

      expectFieldErrors(
        {
          ...validBodyWithoutTimes(),
          hoursKind,
          opensAt: null,
          closesAt: "09:00",
        },
        ["opensAt", "closesAt"],
      );
    },
  );

  it("accepts ordinary, boundary, and overnight intervals", () => {
    expect(
      parseSupplierMutationBody({
        ...validBody(),
        hoursKind: "INTERVAL",
        opensAt: "00:00",
        closesAt: "23:59",
      }),
    ).toMatchObject({ opensAt: "00:00", closesAt: "23:59" });
    expect(
      parseSupplierMutationBody({
        ...validBody(),
        hoursKind: "INTERVAL",
        opensAt: "11:00",
        closesAt: "02:00",
      }),
    ).toMatchObject({ opensAt: "11:00", closesAt: "02:00" });
  });

  it.each([
    [{ opensAt: undefined }, ["opensAt"]],
    [{ closesAt: null }, ["closesAt"]],
    [{ opensAt: "9:00" }, ["opensAt"]],
    [{ closesAt: "24:00" }, ["closesAt"]],
    [{ closesAt: "09:60" }, ["closesAt"]],
    [{ opensAt: "09:00", closesAt: "09:00" }, ["closesAt"]],
  ] as const)("rejects invalid interval case %#", (hours, fields) => {
    expectFieldErrors({ ...validBody(), ...hours }, fields);
  });

  it("rejects unknown and server-owned fields together", () => {
    expectFieldErrors(
      {
        ...validBody(),
        id: "67ef02dc-814d-49e2-b6c2-9bdc433924c0",
        status: "ACTIVE",
        buildingLabel: "COM2",
        extra: true,
      },
      ["id", "status", "buildingLabel", "extra"],
    );
  });

  it.each([null, [], "supplier"])("rejects non-object body %#", (body) => {
    expectFieldError(body, "body");
  });
});

function validBody(): Record<string, unknown> {
  return {
    name: "Printer @ COM2",
    categories: ["PRINTING"],
    buildingCode: "COM2",
    locationDescription: "Next to LT19",
    hoursKind: "INTERVAL",
    opensAt: "09:00",
    closesAt: "18:00",
  };
}

function validBodyWithoutTimes(): Record<string, unknown> {
  const { opensAt: _opensAt, closesAt: _closesAt, ...body } = validBody();
  return body;
}

function expectFieldError(body: unknown, field: string): void {
  expectFieldErrors(body, [field]);
}

function expectFieldErrors(body: unknown, fields: readonly string[]): void {
  try {
    parseSupplierMutationBody(body);
    throw new Error("Expected Supplier body validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getStatus()).toBe(400);
    expect((error as BadRequestException).getResponse()).toEqual(
      expect.objectContaining({
        code: "SUPPLIER_VALIDATION_FAILED",
        message: "Please correct the Supplier details.",
        fieldErrors: expect.objectContaining(
          Object.fromEntries(fields.map((field) => [field, expect.any(String)])),
        ),
      }),
    );
  }
}
