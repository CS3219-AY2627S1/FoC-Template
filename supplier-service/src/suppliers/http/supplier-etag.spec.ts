/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-26.
 * Scope: tested canonical strong Supplier ETag formatting, response headers,
 * parsing, and rejection cases for issue #20 and final review.
 * Author review: Reviewed and approved by @ron.
 */
import { BadRequestException } from "@nestjs/common";

import {
  formatSupplierEtag,
  parseSupplierIfMatch,
  setSupplierEtag,
} from "./supplier-etag";

describe("Supplier ETag responses", () => {
  it.each([
    [0, '"v0"'],
    [7, '"v7"'],
  ])("formats version %s as canonical strong tag %s", (version, expected) => {
    expect(formatSupplierEtag(version)).toBe(expected);
  });

  it("sets the canonical strong ETag response header", () => {
    const response = { setHeader: jest.fn() };

    setSupplierEtag(response, 12);

    expect(response.setHeader).toHaveBeenCalledWith("ETag", '"v12"');
  });
});

describe("parseSupplierIfMatch", () => {
  it.each([
    ['"v0"', 0n],
    ['"v1"', 1n],
    ['"v12"', 12n],
    ['"v900719925474099100000"', 900719925474099100000n],
  ] as const)("parses canonical strong tag %s", (etag, expectedVersion) => {
    expect(parseSupplierIfMatch(etag)).toBe(expectedVersion);
  });

  it.each([
    'W/"v3"',
    "*",
    '"v2", "v3"',
    "v3",
    '"v03"',
    '"3"',
    '"v-1"',
    '"v1.0"',
    ' "v3" ',
    "",
    ["\"v3\"", "\"v4\""],
  ])("rejects non-canonical or non-scalar tag %#", (etag) => {
    try {
      parseSupplierIfMatch(etag);
      throw new Error("Expected If-Match validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getStatus()).toBe(400);
      expect((error as BadRequestException).getResponse()).toEqual({
        code: "SUPPLIER_VALIDATION_FAILED",
        message: "Please correct the If-Match header.",
        fieldErrors: {
          ifMatch:
            'If-Match must contain one canonical strong Supplier ETag, such as "v3".',
        },
      });
    }
  });
});
