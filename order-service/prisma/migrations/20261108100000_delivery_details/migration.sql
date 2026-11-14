-- AI Assistance Disclosure:
-- Tool: Codex (model: GPT-6), date: 2026-11-08
-- Scope: Added deliveryDetails per the team spec.
-- No requirements, architecture, schema, or API decisions were made by the AI tool.
-- Author review:
ALTER TABLE "requests" ADD COLUMN "deliveryDetails" VARCHAR(250) NOT NULL DEFAULT 'Nil';
