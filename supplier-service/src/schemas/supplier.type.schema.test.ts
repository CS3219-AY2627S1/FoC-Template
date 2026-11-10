import test from "node:test";
import assert from "node:assert/strict";
import {
    supplierTypeSchema
} from "../schemas/supplier.type.schema.js";

const validType = "FOOD";

const validInput = {
    type: validType
};

test("supplierTypeSchema accepts a complete valid payload", () => {
    const result = supplierTypeSchema.parse(validInput);
    assert.equal(result.type, "FOOD");
});

test("supplierTypeSchema allows a type entered in lower-case", () => {
    const result = supplierTypeSchema.parse({ ...validInput, type: validInput.type.toLowerCase() });
    assert.equal(result.type, "FOOD");
});

test("supplierTypeSchema rejects missing required fields", () => {
    assert.throws(
        () => supplierTypeSchema.parse({ ...validInput, type: "" }),
        (error: unknown) => error instanceof Error && error.name === "ZodError",
    );
});

test("supplierTypeSchema rejects empty payload", () => {
    assert.throws(
        () => supplierTypeSchema.parse({}),
        (error: unknown) => error instanceof Error && error.name === "ZodError",
    );
});

test("supplierTypeSchema rejects no payload", () => {
    assert.throws(
        () => supplierTypeSchema.parse(null),
        (error: unknown) => error instanceof Error && error.name === "ZodError",
    );
});