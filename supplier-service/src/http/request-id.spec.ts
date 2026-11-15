/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: tested server-owned request identifiers and redacted, one-shot
 * request-completion logging for issue #17.
 * Author review: Reviewed and approved by @ron.
 */
import { EventEmitter } from "node:events";

import {
  createSupplierCompletionLogger,
  createSupplierRequestMiddleware,
  SUPPLIER_REQUEST_COMPLETED_EVENT,
  SupplierRequestCompletionLog,
} from "./request-id";

describe("Supplier request middleware", () => {
  it("correlates a server ID with one redacted completion log", () => {
    const logger = { log: jest.fn() };
    const now = jest.fn().mockReturnValueOnce(1_000).mockReturnValueOnce(1_025);
    const middleware = createSupplierRequestMiddleware(logger, now);
    const request = {
      requestId: "client-controlled-property",
      headers: { "x-request-id": "client-controlled-header" },
      method: "GET",
      path: "/api/v1/suppliers",
      originalUrl: "/api/v1/suppliers?q=secret-search&size=12",
    };
    const response = createResponse(200);
    const next = jest.fn();

    middleware(request, response, next);
    response.writableFinished = true;
    response.emit("finish");
    response.emit("close");

    expect(request.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(request.requestId).not.toBe("client-controlled-property");
    expect(request.requestId).not.toBe("client-controlled-header");
    expect(response.setHeader).toHaveBeenCalledWith(
      "X-Request-Id",
      request.requestId,
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith({
      event: SUPPLIER_REQUEST_COMPLETED_EVENT,
      requestId: request.requestId,
      method: "GET",
      pathname: "/api/v1/suppliers",
      status: 200,
      result: "completed",
      durationMs: 25,
    });
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain("secret-search");
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain("q=");
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain(
      "client-controlled",
    );
  });

  it("logs a closed request as aborted without waiting for finish", () => {
    const logger = { log: jest.fn() };
    const now = jest.fn().mockReturnValueOnce(40).mockReturnValueOnce(47);
    const middleware = createSupplierRequestMiddleware(logger, now);
    const request = {
      requestId: undefined as string | undefined,
      method: "GET",
      url: "/health?probe=sensitive",
    };
    const response = createResponse(200);

    middleware(request, response, jest.fn());
    response.emit("close");
    response.emit("finish");

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: request.requestId,
        pathname: "/health",
        status: 200,
        result: "aborted",
        durationMs: 7,
      }),
    );
  });

  it("emits each structured event as one machine-readable JSON line", () => {
    const chunks: string[] = [];
    const write = jest.spyOn(process.stdout, "write").mockImplementation(
      ((chunk: string | Uint8Array) => {
        chunks.push(chunk.toString());
        return true;
      }) as typeof process.stdout.write,
    );
    const completion: SupplierRequestCompletionLog = {
      event: SUPPLIER_REQUEST_COMPLETED_EVENT,
      requestId: "67ef02dc-814d-49e2-b6c2-9bdc433924c0",
      method: "GET",
      pathname: "/api/v1/suppliers",
      status: 200,
      result: "completed",
      durationMs: 12,
    };

    try {
      createSupplierCompletionLogger().log(completion);
    } finally {
      write.mockRestore();
    }

    const lines = chunks.join("").trimEnd().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual(
      expect.objectContaining({
        level: "log",
        message: completion,
        context: "SupplierHttp",
      }),
    );
  });
});

function createResponse(statusCode: number) {
  return Object.assign(new EventEmitter(), {
    statusCode,
    writableFinished: false,
    setHeader: jest.fn(),
  });
}
