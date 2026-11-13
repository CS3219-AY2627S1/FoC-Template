-- CreateEnum
CREATE TYPE "ErrandStatus" AS ENUM (
    'OPEN', 
    'ACCEPTED', 
    'PICKED_UP', 
    'DELIVERED', 
    'CANCELLED', 
    'EXPIRED', 
    'CONFIRMED'
);

-- CreateTable
CREATE TABLE "errands" (
    "id" UUID NOT NULL,
    "requesterSub" TEXT NOT NULL,
    "courierSub" TEXT,
    "supplierId" TEXT,
    "pickupLat" DOUBLE PRECISION NOT NULL,
    "pickupLng" DOUBLE PRECISION NOT NULL,
    "pickupBuildingName" TEXT NOT NULL,
    "pickupFloorNumber" INTEGER NOT NULL,
    "deliveryDescription" TEXT NOT NULL,
    "deliveryInstructions" TEXT,
    "creditAmount" INTEGER NOT NULL,
    "status" "ErrandStatus" NOT NULL DEFAULT 'OPEN',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "errands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "errands_requesterSub_idx" ON "errands"("requesterSub");

-- CreateIndex
CREATE INDEX "errands_courierSub_idx" ON "errands"("courierSub");

-- CreateIndex
CREATE INDEX "errands_supplierId_idx" ON "errands"("supplierId");

-- CreateIndex
CREATE INDEX "errands_status_expiresAt_idx" ON "errands"("status", "expiresAt");
