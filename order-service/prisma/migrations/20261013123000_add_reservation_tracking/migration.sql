-- AI Assistance Disclosure:
-- Tool: GitHub Copilot SDK in VS Code (model: GPT-5.6 Luna), date: 2026-10-13
-- Scope: Added order reservation and credit-release bookkeeping columns.
-- No requirements, architecture, or API decisions were made by the AI tool.
-- Author review: tng wen xi

ALTER TABLE "requests"
  ADD COLUMN "reservationId" TEXT,
  ADD COLUMN "creditReleasedAt" TIMESTAMPTZ(3);
