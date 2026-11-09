/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Express app wiring: health check, authentication, JSON parsing, routes, error handling.
 * Author review: Reviewed and approved by @mattis.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: optional N2 extraction dependencies (DISABLED when not given), per the approved N2 spec.
 * Author review: Pending review by @mattis.
 */
import express from "express";
import type { Pool } from "pg";
import type { SessionVerifier } from "../adapters/sessionVerifier";
import type { SupplierDirectory } from "../adapters/supplierDirectory";
import { authenticate } from "./auth";
import { errorHandler, sendNotFound } from "./errors";
import { disabledExtraction, type ExtractionDeps } from "./extractionRoutes";
import { errandRoutes } from "./routes";

export function createApp(deps: {
  pool: Pool;
  verifier: SessionVerifier;
  suppliers: SupplierDirectory;
  /** N2 extraction; reports DISABLED when not given */
  extraction?: ExtractionDeps;
}): express.Express {
  const app = express();
  app.disable("x-powered-by");

  app.get("/health", async (_req, res) => {
    try {
      await deps.pool.query("SELECT 1");
      res.status(200).json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });

  // Authenticate before parsing, so anonymous callers get 401 whatever they send
  app.use(authenticate(deps.verifier));
  app.use(express.json());
  app.use(errandRoutes({ ...deps, extraction: deps.extraction ?? disabledExtraction() }));
  app.use((_req, res) => sendNotFound(res));
  app.use(errorHandler);
  return app;
}
