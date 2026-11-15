/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: added server-generated request identifiers and non-sensitive,
 * correlated request-completion logging for issue #17.
 * Author review: Reviewed and approved by @ron.
 */
import { ConsoleLogger, LoggerService } from "@nestjs/common";
import { randomUUID } from "node:crypto";

export interface RequestWithRequestId {
  requestId?: string;
  method?: string;
  path?: string;
  originalUrl?: string;
  url?: string;
}

interface ResponseWithLifecycle {
  statusCode: number;
  writableFinished?: boolean;
  setHeader(name: string, value: string): void;
  once(event: "finish" | "close", listener: () => void): unknown;
}

type Next = () => void;
type Clock = () => number;
type CompletionLogger = Pick<LoggerService, "log">;

export const SUPPLIER_REQUEST_COMPLETED_EVENT =
  "supplier.http.request.completed";

export interface SupplierRequestCompletionLog {
  event: typeof SUPPLIER_REQUEST_COMPLETED_EVENT;
  requestId: string;
  method: string;
  pathname: string;
  status: number;
  result: "completed" | "aborted";
  durationMs: number;
}

export function createSupplierCompletionLogger(): ConsoleLogger {
  return new ConsoleLogger("SupplierHttp", {
    json: true,
    compact: true,
    colors: false,
  });
}

export function createSupplierRequestMiddleware(
  logger: CompletionLogger,
  now: Clock = Date.now,
): (
  request: RequestWithRequestId,
  response: ResponseWithLifecycle,
  next: Next,
) => void {
  return (request, response, next): void => {
    const requestId = randomUUID();
    const startedAt = now();
    const method = request.method ?? "UNKNOWN";
    const pathname = requestPathname(request);
    let logged = false;

    request.requestId = requestId;
    response.setHeader("X-Request-Id", requestId);

    const logOnce = (result: "completed" | "aborted"): void => {
      if (logged) {
        return;
      }
      logged = true;
      const completion: SupplierRequestCompletionLog = {
        event: SUPPLIER_REQUEST_COMPLETED_EVENT,
        requestId,
        method,
        pathname,
        status: response.statusCode,
        result,
        durationMs: Math.max(0, Math.round(now() - startedAt)),
      };
      logger.log(completion);
    };

    response.once("finish", () => logOnce("completed"));
    response.once("close", () =>
      logOnce(response.writableFinished ? "completed" : "aborted"),
    );
    next();
  };
}

function requestPathname(request: RequestWithRequestId): string {
  const path = request.path ?? request.originalUrl ?? request.url ?? "/";
  return path.split("?", 1)[0] || "/";
}
