-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('open', 'accepted', 'picked_up', 'delivered', 'completed', 'cancelled', 'expired');

-- CreateTable
CREATE TABLE "requests" (
    "id" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "deliveryLocation" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "completeBy" TIMESTAMPTZ(3),
    "additionalDetails" TEXT,
    "courierId" UUID,
    "status" "RequestStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "deliveredAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "requests_status_createdAt_idx" ON "requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "requests_requesterId_idx" ON "requests"("requesterId");

-- CreateIndex
CREATE INDEX "requests_courierId_idx" ON "requests"("courierId");
