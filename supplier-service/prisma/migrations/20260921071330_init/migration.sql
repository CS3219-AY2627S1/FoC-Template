-- CreateEnum
CREATE TYPE "SupplierType" AS ENUM ('FOOD', 'RETAIL', 'FACILITIES');

-- CreateEnum
CREATE TYPE "SupplierStatus" AS ENUM ('ACTIVATED', 'DEACTIVATED');

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SupplierType" NOT NULL,
    "status" "SupplierStatus" NOT NULL DEFAULT 'ACTIVATED',
    "building" TEXT NOT NULL,
    "floor" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "startingTime" TIME(0) NOT NULL,
    "closingTime" TIME(0) NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_name_key" ON "Supplier"("name");
