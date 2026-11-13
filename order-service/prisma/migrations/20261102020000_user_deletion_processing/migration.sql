-- AI Assistance Disclosure: ChatGPT (Codex), 2026-11-02.
-- Scope: Human-approved observable manual review and idempotent scrubbing; review pending; see ../../usage-log.md.
CREATE TYPE "UserDeletionState" AS ENUM ('RECEIVED', 'PROCESSED', 'MANUAL_REVIEW_REQUIRED');
ALTER TABLE "UserDeletionEvent"
 ADD COLUMN "state" "UserDeletionState" NOT NULL DEFAULT 'RECEIVED',
 ADD COLUMN "blockingOrderIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 ADD COLUMN "lastError" TEXT,
 ADD COLUMN "processedAt" TIMESTAMPTZ(3);
CREATE INDEX "UserDeletionEvent_state_receivedAt_idx" ON "UserDeletionEvent"("state", "receivedAt");
