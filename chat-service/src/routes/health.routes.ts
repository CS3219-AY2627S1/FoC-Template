/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-09
 * Scope: Implemented the approved health contract from order-service/src/routes/health.routes.ts.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 */
import { Router } from "express";
import type { PrismaClient } from "../db/prisma.js";

export function healthRouter(db: Pick<PrismaClient, "$queryRaw">): Router {
  const router = Router();
  router.get("/", async (_req, res) => {
    try {
      await db.$queryRaw`SELECT 1`;
      res.json({ status: "ok", database: "up" });
    } catch (err) {
      console.error("Health check failed:", err);
      res.status(503).json({ status: "error", database: "down" });
    }
  });
  return router;
}
