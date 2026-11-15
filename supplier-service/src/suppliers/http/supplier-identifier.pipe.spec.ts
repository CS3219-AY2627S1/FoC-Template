/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: tested Supplier Identifier validation, including durable UUIDv5 seed
 * identifiers and the preserved public 400 shape, for issue #17.
 * Author review: Reviewed and approved by @ron.
 */
import { BadRequestException } from "@nestjs/common";

import { SupplierIdentifierPipe } from "./supplier-identifier.pipe";

describe("SupplierIdentifierPipe", () => {
  const pipe = new SupplierIdentifierPipe();

  it("accepts a UUIDv5 seed Supplier Identifier", () => {
    const seedId = "ac2288df-661c-5d78-bcc1-ac6bca30fe51";
    expect(pipe.transform(seedId)).toBe(seedId);
  });

  it("accepts other PostgreSQL UUID strings", () => {
    const generatedId = "67ef02dc-814d-49e2-b6c2-9bdc433924c0";
    expect(pipe.transform(generatedId)).toBe(generatedId);
  });

  it("rejects a malformed Supplier Identifier with a field error", () => {
    try {
      pipe.transform("not-a-uuid");
      throw new Error("Expected Supplier Identifier validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getStatus()).toBe(400);
      expect((error as BadRequestException).getResponse()).toEqual({
        code: "SUPPLIER_VALIDATION_FAILED",
        message: "Please correct the Supplier Identifier.",
        fieldErrors: { id: "Supplier Identifier must be a UUID." },
      });
    }
  });
});
