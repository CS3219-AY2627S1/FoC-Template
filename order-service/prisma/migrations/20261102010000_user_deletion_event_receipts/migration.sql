-- AI Assistance Disclosure: ChatGPT (Codex), 2026-11-02.
-- Scope: Approved durable deletion-event tracking; review pending; see ../../usage-log.md.
CREATE TABLE "UserDeletionEvent" (
  "eventId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL,
  "deletedAt" TIMESTAMPTZ(3) NOT NULL,
  "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserDeletionEvent_pkey" PRIMARY KEY ("eventId")
);
CREATE INDEX "UserDeletionEvent_userId_idx" ON "UserDeletionEvent"("userId");
