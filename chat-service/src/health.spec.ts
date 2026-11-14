/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-09
 * Scope: Verified unauthenticated health responses for database success and failure.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 */
import request from "supertest";
import { createApp } from "./app.js";
import type { PrismaClient } from "./db/prisma.js";

it("GET /health returns 200 without authentication when the database responds", async () => {
  const queryRaw = vi.fn().mockResolvedValue([{ value: 1 }]);
  const app = createApp({
    prisma: { $queryRaw: queryRaw } as unknown as PrismaClient,
    apiKey: "test-service-key",
  });
  await request(app)
    .get("/health")
    .expect(200, { status: "ok", database: "up" });
  expect(queryRaw).toHaveBeenCalledWith(["SELECT 1"]);
});

it("GET /health returns 503 when the database query fails", async () => {
  const error = new Error("Database unavailable");
  const queryRaw = vi.fn().mockRejectedValue(error);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const app = createApp({
      prisma: { $queryRaw: queryRaw } as unknown as PrismaClient,
      apiKey: "test-service-key",
    });
    await request(app)
      .get("/health")
      .expect(503, { status: "error", database: "down" });
    expect(log).toHaveBeenCalledWith("Health check failed:", error);
  } finally {
    log.mockRestore();
  }
});
