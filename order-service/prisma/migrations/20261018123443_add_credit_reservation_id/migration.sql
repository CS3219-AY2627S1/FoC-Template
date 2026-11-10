/*
  Warnings:

  - A unique constraint covering the columns `[creditReservationId]` on the table `Order` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "creditReservationId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "Order_creditReservationId_key" ON "Order"("creditReservationId");
