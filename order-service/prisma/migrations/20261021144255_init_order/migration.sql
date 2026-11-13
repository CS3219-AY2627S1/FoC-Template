-- AI Assistance Disclosure: ChatGPT (Codex), 2026-10-21.
-- Scope: Prisma-generated SQL from the author-supplied schema.
-- Author review: Pending; see ../../../../ai/usage-log.md.
-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('UNASSIGNED', 'ASSIGNED', 'PICKED_UP', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CancellationReason" AS ENUM ('REQUESTER', 'EXPIRY');

-- CreateEnum
CREATE TYPE "CreditState" AS ENUM ('RESERVED', 'SETTLEMENT_PENDING', 'SETTLED', 'REFUND_PENDING', 'REFUNDED');

-- CreateEnum
CREATE TYPE "CreationState" AS ENUM ('PENDING', 'SUCCEEDED', 'COMPENSATING', 'FAILED');

-- CreateEnum
CREATE TYPE "CreditOperationType" AS ENUM ('RESERVE', 'SETTLE', 'REFUND');

-- CreateEnum
CREATE TYPE "OperationState" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'PERMANENTLY_FAILED');

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "requesterId" TEXT NOT NULL,
    "courierId" TEXT,
    "supplierId" BIGINT NOT NULL,
    "pickupStore" TEXT NOT NULL,
    "pickupLocation" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "courierName" TEXT,
    "destination" TEXT NOT NULL,
    "requestDetails" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "expiryTime" TIMESTAMPTZ(3) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'UNASSIGNED',
    "cancellationReason" "CancellationReason",
    "creditState" "CreditState" NOT NULL DEFAULT 'RESERVED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "pickedUpAt" TIMESTAMPTZ(3),
    "deliveredAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderCreation" (
    "orderId" UUID NOT NULL,
    "requesterId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "state" "CreationState" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrderCreation_pkey" PRIMARY KEY ("orderId")
);

-- CreateTable
CREATE TABLE "CreditOperation" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "type" "CreditOperationType" NOT NULL,
    "payload" JSONB NOT NULL,
    "state" "OperationState" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseExpiresAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CreditOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Order_status_expiryTime_idx" ON "Order"("status", "expiryTime");

-- CreateIndex
CREATE INDEX "Order_requesterId_createdAt_idx" ON "Order"("requesterId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_courierId_createdAt_idx" ON "Order"("courierId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderCreation_requesterId_idempotencyKey_key" ON "OrderCreation"("requesterId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "CreditOperation_state_nextRetryAt_idx" ON "CreditOperation"("state", "nextRetryAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditOperation_orderId_type_key" ON "CreditOperation"("orderId", "type");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_id_fkey" FOREIGN KEY ("id") REFERENCES "OrderCreation"("orderId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditOperation" ADD CONSTRAINT "CreditOperation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OrderCreation"("orderId") ON DELETE RESTRICT ON UPDATE CASCADE;
