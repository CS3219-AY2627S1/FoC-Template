/*
  Warnings:

  - You are about to drop the column `previousReservationId` on the `CreditReservation` table. All the data in the column will be lost.
  - You are about to drop the column `renewalKey` on the `CreditReservation` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[requestEventId]` on the table `CreditReservation` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `requestEventId` to the `CreditReservation` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ReservationRequestType" AS ENUM ('CREATE', 'RENEW');

-- CreateEnum
CREATE TYPE "ReservationRequestOutcome" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "CreditOutboxEventType" AS ENUM ('CREDIT_RESERVATION_SUCCEEDED', 'CREDIT_RESERVATION_FAILED');

-- CreateEnum
CREATE TYPE "CreditOutboxEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'PUBLISHED', 'DEAD');

-- DropIndex
DROP INDEX "CreditReservation_renewalKey_key";

-- AlterTable
ALTER TABLE "CreditReservation" DROP COLUMN "previousReservationId",
DROP COLUMN "renewalKey",
ADD COLUMN     "requestEventId" UUID NOT NULL;

-- CreateTable
CREATE TABLE "ReservationRequest" (
    "eventId" UUID NOT NULL,
    "requestType" "ReservationRequestType" NOT NULL,
    "orderId" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "previousReservationId" UUID,
    "outcome" "ReservationRequestOutcome" NOT NULL,
    "failureCode" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "creditReservationId" UUID,

    CONSTRAINT "ReservationRequest_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "CreditOutboxEvent" (
    "id" UUID NOT NULL,
    "requestEventId" UUID NOT NULL,
    "eventType" "CreditOutboxEventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "CreditOutboxEventStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMPTZ(6),
    "nextAttemptAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMPTZ(6),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "CreditOutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReservationRequest_orderId_createdAt_idx" ON "ReservationRequest"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditOutboxEvent_requestEventId_key" ON "CreditOutboxEvent"("requestEventId");

-- CreateIndex
CREATE INDEX "CreditOutboxEvent_status_nextAttemptAt_createdAt_idx" ON "CreditOutboxEvent"("status", "nextAttemptAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditReservation_requestEventId_key" ON "CreditReservation"("requestEventId");

-- AddForeignKey
ALTER TABLE "CreditReservation" ADD CONSTRAINT "CreditReservation_requestEventId_fkey" FOREIGN KEY ("requestEventId") REFERENCES "ReservationRequest"("eventId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CreditOutboxEvent" ADD CONSTRAINT "CreditOutboxEvent_requestEventId_fkey" FOREIGN KEY ("requestEventId") REFERENCES "ReservationRequest"("eventId") ON DELETE RESTRICT ON UPDATE RESTRICT;
