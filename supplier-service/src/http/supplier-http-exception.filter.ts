/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: added non-sensitive, request-correlated Supplier HTTP error responses
 * and adopted shared fallback definitions for issue #17.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-26; preserved the
 * approved duplicate Supplier identifier in 409 responses for issue #22.
 * Author review: Reviewed and approved by @ron.
 */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";

import { RequestWithRequestId } from "./request-id";
import {
  DEFAULT_SUPPLIER_HTTP_ERRORS,
  SUPPLIER_HTTP_ERRORS,
} from "./supplier-http-errors";

interface ErrorResponse {
  status(statusCode: number): ErrorResponse;
  json(body: SupplierErrorBody): void;
}

interface SupplierErrorBody {
  code: string;
  message: string;
  fieldErrors?: Readonly<Record<string, string>>;
  existingSupplierId?: string;
  requestId: string;
}

interface ErrorPayload {
  code?: unknown;
  message?: unknown;
  fieldErrors?: unknown;
  existingSupplierId?: unknown;
}

@Catch()
export class SupplierHttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithRequestId>();
    const response = http.getResponse<ErrorResponse>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const fallback =
      DEFAULT_SUPPLIER_HTTP_ERRORS[status] ??
      SUPPLIER_HTTP_ERRORS.internalServerError;
    const payload = this.getPayload(exception);

    const body: SupplierErrorBody = {
      code: typeof payload.code === "string" ? payload.code : fallback.code,
      message:
        typeof payload.message === "string"
          ? payload.message
          : fallback.message,
      requestId: request.requestId ?? randomFallbackRequestId(),
    };
    if (isFieldErrors(payload.fieldErrors)) {
      body.fieldErrors = payload.fieldErrors;
    }
    if (typeof payload.existingSupplierId === "string") {
      body.existingSupplierId = payload.existingSupplierId;
    }

    response.status(status).json(body);
  }

  private getPayload(exception: unknown): ErrorPayload {
    if (!(exception instanceof HttpException)) {
      return {};
    }

    const response = exception.getResponse();
    if (typeof response !== "object" || response === null || Array.isArray(response)) {
      return typeof response === "string" ? { message: response } : {};
    }
    return response as ErrorPayload;
  }
}

function isFieldErrors(
  value: unknown,
): value is Readonly<Record<string, string>> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((error) => typeof error === "string")
  );
}

function randomFallbackRequestId(): string {
  // The middleware normally owns ID creation. Avoid reflecting any inbound ID
  // if an adapter invokes the filter without running middleware first.
  return randomUUID();
}
