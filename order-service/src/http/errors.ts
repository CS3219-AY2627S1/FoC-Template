/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Error bodies and the mapping from repository and database failures to HTTP statuses,
 *        implementing the approved plan.
 * Author review: Reviewed and approved by @mattis.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-18
 * Scope: 503 SERVICE_UNAVAILABLE for an unreachable User or Supplier service, per the User and Supplier integration plan.
 * Author review: Reviewed and approved by @mattis.
 */
import type { ErrorRequestHandler, Response } from "express";
import { UpstreamUnavailableError } from "../adapters/upstream";
import { isDatabaseUnavailable } from "../dbAvailability";
import type { FieldError } from "../domain/validation";
import type { Action } from "../domain/transitions";
import { errorMessage, log } from "../log";
import type { TransitionResult } from "../errands/repository";

export function sendError(res: Response, status: number, error: string, message: string, extra: object = {}): void {
  res.status(status).json({ error, message, ...extra });
}

export function sendValidation(res: Response, details: FieldError[]): void {
  sendError(res, 400, "VALIDATION_ERROR", "Request is invalid", { details });
}

export function sendNotFound(res: Response): void {
  sendError(res, 404, "NOT_FOUND", "Not found");
}

/** Writes the HTTP response for a failed transition. */
export function sendTransitionFailure(res: Response, action: Action, r: Extract<TransitionResult, { ok: false }>): void {
  switch (r.error) {
    case "NOT_FOUND":
      return sendNotFound(res);
    case "FORBIDDEN":
      return sendError(res, 403, "FORBIDDEN", "You may not do this to this errand");
    case "CANNOT_ACCEPT_OWN_ERRAND":
      return sendError(res, 403, "CANNOT_ACCEPT_OWN_ERRAND", "You cannot accept your own errand");
    case "DEADLINE_PASSED":
      return sendError(res, 409, "DEADLINE_PASSED", "The deadline for this step has passed");
    case "INVALID_STATE":
      if (action === "accept") {
        return sendError(res, 409, "ERRAND_NO_LONGER_AVAILABLE", "This errand is no longer available", { currentState: r.currentState });
      }
      return sendError(res, 409, "INVALID_STATE", "The errand is not in a state that allows this", { currentState: r.currentState });
  }
}

/** Express error middleware: bad JSON is 400, an unreachable database, User or Supplier is 503, anything else 500. */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = (err as { status?: unknown }).status;
  // body-parser errors carry a string `type` and a 4xx status
  if (typeof (err as { type?: unknown }).type === "string" && typeof status === "number" && status >= 400 && status < 500) {
    if (status === 413) return sendError(res, 413, "PAYLOAD_TOO_LARGE", "Request body is too large");
    if (status === 415) return sendError(res, 415, "UNSUPPORTED_MEDIA_TYPE", "Unsupported charset or content encoding");
    return sendValidation(res, [{ field: "body", message: "body must be valid JSON" }]);
  }
  if (isDatabaseUnavailable(err)) {
    log.warn("http.database_unavailable", { path: req.path, message: errorMessage(err) });
    return sendError(res, 503, "SERVICE_UNAVAILABLE", "Service temporarily unavailable");
  }
  if (err instanceof UpstreamUnavailableError) {
    log.warn("http.upstream_unavailable", { path: req.path, service: err.service, message: err.message });
    return sendError(res, 503, "SERVICE_UNAVAILABLE", "Service temporarily unavailable");
  }
  log.error("http.unhandled_error", { path: req.path, message: errorMessage(err), stack: err instanceof Error ? err.stack : undefined });
  sendError(res, 500, "INTERNAL_ERROR", "Internal server error");
};
