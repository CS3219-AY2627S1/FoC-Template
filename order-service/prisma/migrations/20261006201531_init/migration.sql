-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('OPEN', 'ACCEPTED', 'PICKED_UP', 'COMPLETED', 'RECEIVED', 'CANCELED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "OrderEventType" AS ENUM ('ORDER_OPENED', 'ORDER_CANCELED', 'ORDER_COMPLETED', 'ORDER_EXPIRED', 'ORDER_RECEIVED', 'ORDER_FAILED');

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "courierId" UUID,
    "name" VARCHAR(255) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "pickupSupplierId" UUID NOT NULL,
    "deliverySupplierId" UUID NOT NULL,
    "offeredCredits" INTEGER NOT NULL,
    "remarks" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'OPEN',
    "expiryAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(6),
    "pickedUpAt" TIMESTAMPTZ(6),
    "completedAt" TIMESTAMPTZ(6),
    "receivedAt" TIMESTAMPTZ(6),
    "cancelledAt" TIMESTAMPTZ(6),
    "expiredAt" TIMESTAMPTZ(6),
    "failedAt" TIMESTAMPTZ(6),
    "cancellationReason" TEXT,
    "failureReason" TEXT,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusHistory" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "changedBy" UUID,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "eventType" "OrderEventType" NOT NULL,
    "eventVersion" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMPTZ(6),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Order_status_expiryAt_idx" ON "Order"("status", "expiryAt");

-- CreateIndex
CREATE INDEX "Order_status_offeredCredits_idx" ON "Order"("status", "offeredCredits");

-- CreateIndex
CREATE INDEX "Order_status_pickupSupplierId_expiryAt_idx" ON "Order"("status", "pickupSupplierId", "expiryAt");

-- CreateIndex
CREATE INDEX "Order_status_deliverySupplierId_expiryAt_idx" ON "Order"("status", "deliverySupplierId", "expiryAt");

-- CreateIndex
CREATE INDEX "Order_requesterId_createdAt_idx" ON "Order"("requesterId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_courierId_createdAt_idx" ON "Order"("courierId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_orderId_createdAt_idx" ON "OrderStatusHistory"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_publishedAt_createdAt_idx" ON "OutboxEvent"("publishedAt", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_orderId_idx" ON "OutboxEvent"("orderId");

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
