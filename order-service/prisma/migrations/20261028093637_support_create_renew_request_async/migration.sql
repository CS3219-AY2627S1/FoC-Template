/*
  Warnings:

  - You are about to drop the column `eventVersion` on the `OutboxEvent` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "OutboxEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'PUBLISHED', 'DEAD');

-- CreateEnum
CREATE TYPE "CreditReservationResultType" AS ENUM ('CREDIT_RESERVATION_SUCCEEDED', 'CREDIT_RESERVATION_FAILED');

-- AlterEnum
ALTER TYPE "OrderEventType" ADD VALUE 'CREDIT_RESERVATION_REQUEST';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderStatus" ADD VALUE 'PENDING_RESERVATION';
ALTER TYPE "OrderStatus" ADD VALUE 'RESERVATION_FAILED';

-- DropIndex
DROP INDEX "OutboxEvent_publishedAt_createdAt_idx";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "renewalFailureCode" VARCHAR(255),
ADD COLUMN     "renewalPending" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reservationFailureCode" TEXT,
ALTER COLUMN "creditReservationId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "OutboxEvent" DROP COLUMN "eventVersion",
ADD COLUMN     "lockedUntil" TIMESTAMPTZ(6),
ADD COLUMN     "nextAttemptAt" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "status" "OutboxEventStatus" NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "CreditReservationResultInbox" (
    "eventId" UUID NOT NULL,
    "correlationId" UUID NOT NULL,
    "eventType" "CreditReservationResultType" NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditReservationResultInbox_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE INDEX "CreditReservationResultInbox_correlationId_idx" ON "CreditReservationResultInbox"("correlationId");

-- CreateIndex
CREATE INDEX "OutboxEvent_status_nextAttemptAt_createdAt_idx" ON "OutboxEvent"("status", "nextAttemptAt", "createdAt");
