/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: tested successful and failed database readiness behavior.
 * Author review: Reviewed and approved by @ron.
 */
import { ServiceUnavailableException } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import { HealthService } from "./health.service";

describe("HealthService", () => {
  it("reports ready after PostgreSQL responds", async () => {
    const database = { ping: jest.fn().mockResolvedValue(undefined) };
    const health = new HealthService(database as unknown as DatabaseService);

    await expect(health.getReadiness()).resolves.toEqual({ status: "ok" });
  });

  it("reports unavailable without leaking the database error", async () => {
    const database = {
      ping: jest.fn().mockRejectedValue(new Error("secret connection details")),
    };
    const health = new HealthService(database as unknown as DatabaseService);

    await expect(health.getReadiness()).rejects.toEqual(
      new ServiceUnavailableException({ status: "not_ready" }),
    );
  });
});
