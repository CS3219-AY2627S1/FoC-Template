/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-07
 * Scope: Implemented the team-specified chat creation endpoint and supporting scaffold.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
export function authenticateService(apiKey: string): RequestHandler {
  if (!apiKey) throw new Error("CHAT_SERVICE_API_KEY is required");
  const expected = createHash("sha256").update(apiKey).digest();
  return (req, res, next) => {
    const supplied = req.get("x-service-key");
    if (
      !supplied ||
      !timingSafeEqual(createHash("sha256").update(supplied).digest(), expected)
    ) {
      res
        .status(401)
        .json({
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Invalid service credentials",
          },
        });
      return;
    }
    if (req.get("x-service-name") !== "order-service") {
      res
        .status(403)
        .json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Service is not permitted to perform this operation",
          },
        });
      return;
    }
    next();
  };
}
