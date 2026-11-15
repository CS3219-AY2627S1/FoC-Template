/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: tested stable, request-correlated Supplier HTTP error formatting for
 * issue #17.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-26; tested duplicate
 * identifier preservation for issue #22. Author review: Reviewed and approved by @ron.
 */
import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";

import { SupplierHttpExceptionFilter } from "./supplier-http-exception.filter";

describe("SupplierHttpExceptionFilter", () => {
  it("adds the server request ID while retaining useful validation fields", () => {
    const response = {
      status: jest.fn(),
      json: jest.fn(),
    };
    response.status.mockReturnValue(response);
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ requestId: "server-generated-id" }),
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
    const exception = new BadRequestException({
      code: "SUPPLIER_VALIDATION_FAILED",
      message: "Please correct the query parameters.",
      fieldErrors: { size: "Provide an integer from 1 to 100." },
    });

    new SupplierHttpExceptionFilter().catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      code: "SUPPLIER_VALIDATION_FAILED",
      message: "Please correct the query parameters.",
      fieldErrors: { size: "Provide an integer from 1 to 100." },
      requestId: "server-generated-id",
    });
  });

  it("preserves the existing Supplier identifier on duplicate conflicts", () => {
    const response = {
      status: jest.fn(),
      json: jest.fn(),
    };
    response.status.mockReturnValue(response);
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ requestId: "server-generated-id" }),
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
    const exception = new ConflictException({
      code: "SUPPLIER_ALREADY_EXISTS",
      message: "A Supplier already exists at this location.",
      existingSupplierId: "a65dd942-d369-4a16-96c4-24e9ce7055ca",
    });

    new SupplierHttpExceptionFilter().catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      code: "SUPPLIER_ALREADY_EXISTS",
      message: "A Supplier already exists at this location.",
      existingSupplierId: "a65dd942-d369-4a16-96c4-24e9ce7055ca",
      requestId: "server-generated-id",
    });
  });
});
