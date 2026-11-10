/*
  Warnings:

  - Changed the type of `type` on the `Supplier` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- (manually edited) AlterTable
ALTER TABLE "Supplier" ALTER COLUMN "type" TYPE TEXT USING "type"::TEXT;

-- DropEnum
DROP TYPE "SupplierType";

-- CreateTable
CREATE TABLE "SupplierType" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "SupplierType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupplierType_type_key" ON "SupplierType"("type");

-- CreateIndex
CREATE INDEX "SupplierType_type_idx" ON "SupplierType"("type");

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_type_fkey" FOREIGN KEY ("type") REFERENCES "SupplierType"("type") ON DELETE CASCADE ON UPDATE CASCADE;
