/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-08
 * Scope: Implemented the team-specified message sending and realtime delivery.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { createAuthenticate, type TokenVerifier } from "./authenticate.js";
export function authenticateMessage(
  apiKey: string,
  userServiceUrl: string,
  verifyToken?: TokenVerifier,
): RequestHandler {
  const authenticateUser = createAuthenticate(userServiceUrl, verifyToken);
  const expected = createHash("sha256").update(apiKey).digest();
  return (req, res, next) => {
    const key = req.get("x-service-key");
    if (key === undefined) {
      authenticateUser(req, res, next);
      return;
    }
    if (
      !apiKey ||
      !timingSafeEqual(createHash("sha256").update(key).digest(), expected)
    ) {
      res.status(401).json({ message: "Unauthorized", code: "UNAUTHORIZED" });
      return;
    }
    // A verified service key authorizes a null sender, independently of service name.
    next();
  };
}
