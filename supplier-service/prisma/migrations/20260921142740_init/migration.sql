/*
  Warnings:

  - You are about to drop the column `closingTime` on the `Supplier` table. All the data in the column will be lost.
  - You are about to drop the column `startingTime` on the `Supplier` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "Day" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- AlterTable
ALTER TABLE "Supplier" DROP COLUMN "closingTime",
DROP COLUMN "startingTime";

-- CreateTable
CREATE TABLE "OpeningHours" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "day" "Day" NOT NULL,
    "openingTime" TIME(0) NOT NULL,
    "closingTime" TIME(0) NOT NULL,

    CONSTRAINT "OpeningHours_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OpeningHours_supplierId_idx" ON "OpeningHours"("supplierId");

-- AddForeignKey
ALTER TABLE "OpeningHours" ADD CONSTRAINT "OpeningHours_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
