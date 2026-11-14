-- AI Assistance Disclosure:
-- Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
-- Scope: Migration for issue #4 per George's decisions (2026-10-19/20): new `pending`
--        request status, drop `reservationId` (order id is the credit idempotency key),
--        `outbox` and `dead_letter_jobs` tables mirroring supplier-service's columns.
--        Hand-written (prisma migrate dev unavailable in the AI workspace).
--        No requirements, architecture, schema, or API decisions were made by the AI tool.
-- Author review: george-yeo

-- AlterEnum
ALTER TYPE "RequestStatus" ADD VALUE 'pending' BEFORE 'open';

-- AlterTable
ALTER TABLE "requests" DROP COLUMN "reservationId";

-- CreateTable
CREATE TABLE "outbox" (
    "id" BIGSERIAL NOT NULL,
    "taskName" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "version" INTEGER NOT NULL,

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dead_letter_jobs" (
    "id" BIGSERIAL NOT NULL,
    "jobId" TEXT NOT NULL,
    "taskName" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "errorTrace" TEXT NOT NULL,
    "failedAt" TIMESTAMPTZ(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNRESOLVED',

    CONSTRAINT "dead_letter_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dead_letter_jobs_status_idx" ON "dead_letter_jobs"("status");
