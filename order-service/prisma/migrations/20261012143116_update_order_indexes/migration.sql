-- DropIndex
DROP INDEX "Order_courierId_createdAt_idx";

-- DropIndex
DROP INDEX "Order_requesterId_createdAt_idx";

-- DropIndex
DROP INDEX "Order_status_deliverySupplierId_expiryAt_idx";

-- DropIndex
DROP INDEX "Order_status_offeredCredits_idx";

-- DropIndex
DROP INDEX "Order_status_pickupSupplierId_expiryAt_idx";

-- CreateIndex
CREATE INDEX "Order_requesterId_status_createdAt_idx" ON "Order"("requesterId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_requesterId_status_expiryAt_idx" ON "Order"("requesterId", "status", "expiryAt");

-- CreateIndex
CREATE INDEX "Order_courierId_status_createdAt_idx" ON "Order"("courierId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_courierId_status_expiryAt_idx" ON "Order"("courierId", "status", "expiryAt");
