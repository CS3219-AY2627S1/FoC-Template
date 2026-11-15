/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: regression-tested centralized Supplier public HTTP error factories
 * during issue #17 review remediation.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-26; tested mutation
 * conflict and precondition error contracts for issue #22.
 * Author review: Reviewed and approved by @ron.
 */
import {
  DEFAULT_SUPPLIER_HTTP_ERRORS,
  supplierAlreadyExistsException,
  supplierAuthenticationUnavailableException,
  supplierForbiddenException,
  supplierNotFoundException,
  supplierPreconditionRequiredException,
  supplierUnauthenticatedException,
  supplierValidationException,
  supplierVersionConflictException,
  SUPPLIER_HTTP_ERRORS,
} from "./supplier-http-errors";

describe("Supplier public HTTP errors", () => {
  it("keeps filter fallbacks tied to the shared definitions", () => {
    expect(DEFAULT_SUPPLIER_HTTP_ERRORS[400]).toBe(
      SUPPLIER_HTTP_ERRORS.invalidRequest,
    );
    expect(DEFAULT_SUPPLIER_HTTP_ERRORS[401]).toBe(
      SUPPLIER_HTTP_ERRORS.unauthenticated,
    );
    expect(DEFAULT_SUPPLIER_HTTP_ERRORS[403]).toBe(
      SUPPLIER_HTTP_ERRORS.forbidden,
    );
    expect(DEFAULT_SUPPLIER_HTTP_ERRORS[404]).toBe(
      SUPPLIER_HTTP_ERRORS.supplierNotFound,
    );
    expect(DEFAULT_SUPPLIER_HTTP_ERRORS[409]).toBe(
      SUPPLIER_HTTP_ERRORS.supplierAlreadyExists,
    );
    expect(DEFAULT_SUPPLIER_HTTP_ERRORS[412]).toBe(
      SUPPLIER_HTTP_ERRORS.supplierVersionConflict,
    );
    expect(DEFAULT_SUPPLIER_HTTP_ERRORS[428]).toBe(
      SUPPLIER_HTTP_ERRORS.supplierPreconditionRequired,
    );
    expect(DEFAULT_SUPPLIER_HTTP_ERRORS[503]).toBe(
      SUPPLIER_HTTP_ERRORS.serviceUnavailable,
    );
  });

  it.each([
    [supplierUnauthenticatedException, 401, SUPPLIER_HTTP_ERRORS.unauthenticated],
    [supplierForbiddenException, 403, SUPPLIER_HTTP_ERRORS.forbidden],
    [supplierNotFoundException, 404, SUPPLIER_HTTP_ERRORS.supplierNotFound],
    [
      supplierVersionConflictException,
      412,
      SUPPLIER_HTTP_ERRORS.supplierVersionConflict,
    ],
    [
      supplierPreconditionRequiredException,
      428,
      SUPPLIER_HTTP_ERRORS.supplierPreconditionRequired,
    ],
    [
      supplierAuthenticationUnavailableException,
      503,
      SUPPLIER_HTTP_ERRORS.authenticationUnavailable,
    ],
  ] as const)("creates stable public error case %#", (factory, status, body) => {
    const exception = factory();

    expect(exception.getStatus()).toBe(status);
    expect(exception.getResponse()).toEqual(body);
  });

  it("identifies the existing Supplier in a duplicate conflict", () => {
    expect(
      supplierAlreadyExistsException(
        "a65dd942-d369-4a16-96c4-24e9ce7055ca",
      ).getResponse(),
    ).toEqual({
      code: "SUPPLIER_ALREADY_EXISTS",
      message: "A Supplier already exists at this location.",
      existingSupplierId: "a65dd942-d369-4a16-96c4-24e9ce7055ca",
    });
  });

  it("retains validation fields and a context-specific forbidden message", () => {
    expect(
      supplierValidationException("Correct the query.", { q: "Too long." })
        .getResponse(),
    ).toEqual({
      code: "SUPPLIER_VALIDATION_FAILED",
      message: "Correct the query.",
      fieldErrors: { q: "Too long." },
    });
    expect(
      supplierForbiddenException("Administrators only.").getResponse(),
    ).toEqual({ code: "FORBIDDEN", message: "Administrators only." });
  });
});
