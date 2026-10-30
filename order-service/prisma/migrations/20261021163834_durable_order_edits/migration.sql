-- AI Assistance Disclosure: ChatGPT (Codex), 2026-10-22.
-- Scope: Generated migration from author-approved durable edit model.
-- Author review: Pending; see ../../../usage-log.md.
-- CreateEnum
CREATE TYPE "EditOperationState" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'RECONCILIATION_REQUIRED');

-- CreateTable
CREATE TABLE "OrderEditOperation" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "requesterId" TEXT NOT NULL,
    "state" "EditOperationState" NOT NULL DEFAULT 'PENDING',
    "expectedVersion" INTEGER NOT NULL,
    "targetCredits" INTEGER NOT NULL,
    "proposedChanges" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseExpiresAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrderEditOperation_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "OrderEditOperation" ADD CONSTRAINT "OrderEditOperation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
