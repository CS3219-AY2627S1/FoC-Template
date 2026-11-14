-- AI Assistance Disclosure:
-- Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
-- Scope: Stage 28a (Scheduled Errands) per instructions.md - OrderSeries table, SeriesStatus/
--        RetryType enums, and seriesId (FK, ON DELETE SET NULL) / failureReason on requests.
--        No requirements, architecture, schema, or API decisions were made by the AI tool.
-- Author review:

-- CreateEnum
CREATE TYPE "SeriesStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "RetryType" AS ENUM ('user_service_unreachable', 'supplier_service_unreachable', 'supplier_closed');

-- AlterTable
ALTER TABLE "requests" ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "seriesId" UUID;

-- CreateTable
CREATE TABLE "order_series" (
    "id" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "deliveryLocationId" INTEGER NOT NULL,
    "deliveryDetails" VARCHAR(250) NOT NULL DEFAULT 'Nil',
    "credits" INTEGER NOT NULL,
    "durationMinutes" INTEGER,
    "additionalDetails" TEXT,
    "rrule" TEXT NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "nextFireAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "SeriesStatus" NOT NULL DEFAULT 'active',
    "currentOccurrenceAt" TIMESTAMPTZ(3),
    "retryType" "RetryType",
    "attemptCount" INTEGER,
    "nextRetryAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "order_series_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_series_nextFireAt_status_idx" ON "order_series"("nextFireAt", "status");

-- CreateIndex
CREATE INDEX "order_series_requesterId_idx" ON "order_series"("requesterId");

-- CreateIndex
CREATE INDEX "requests_seriesId_idx" ON "requests"("seriesId");

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "order_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;
