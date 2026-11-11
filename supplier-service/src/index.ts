/**
 * AI Assistance Disclosure
 * Tool: Cursor (Auto), date: 2026-11-09
 * Scope: Implementation assistance for Supplier Service under author-fixed requirements and architecture.
 * Author review: Sahana Avantika generated ideas, designed implementation, validated correctness, edited where needed, and verified behavior/tests.
 */

import express from "express";
import suppliersRouter from "./routes/suppliers";

const app = express();
app.use(express.json());

// Kubernetes liveness/readiness probe. No database call, so a database outage
// doesn't get healthy pods restarted.
app.get("/health", (_req, res) => {
  res.json({ service: "supplier-service", status: "ok" });
});

app.use("/api/v1/supplier", suppliersRouter);

const PORT = process.env.PORT || 8081;
app.listen(PORT, () => console.log(`Supplier service running on port ${PORT}`));