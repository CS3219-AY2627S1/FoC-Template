/**
 * AI Assistance Disclosure
 * Tool: OpenAI Codex (GPT-5.6 Luna, GPT-5.6 Sol, GPT-6 Sol and GPT-6.1 Sol), 2026-09-25 to 2026-11-11.
 * Scope: Implementation and test assistance under author-finalized User Service requirements and architecture.
 * Author review: Josh Wang Kai Kiat validated correctness, edited where needed, and verified behavior/tests.
 */

import { NextFunction, Request, Response } from "express";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
): void {
  response.set("Cache-Control", "no-store");
  if (error instanceof AppError) {
    response.status(error.status).json({ error: error.message, code: error.code });
    return;
  }

  if (error && typeof error === "object" && "type" in error) {
    if (error.type === "entity.parse.failed") {
      response.status(400).json({ error: "Malformed JSON request", code: "INVALID_JSON" });
      return;
    }
    if (error.type === "entity.too.large") {
      response.status(413).json({ error: "Request body is too large", code: "REQUEST_TOO_LARGE" });
      return;
    }
  }
  // Raw parser/database errors can contain passwords, request bodies or URLs.
  console.error("Unhandled User Service error");
  response.status(500).json({
    error: "An unexpected error occurred",
    code: "INTERNAL_ERROR",
  });
}
