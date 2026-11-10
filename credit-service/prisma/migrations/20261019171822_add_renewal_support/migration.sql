/*
  Warnings:

  - A unique constraint covering the columns `[renewalKey]` on the table `CreditReservation` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "CreditReservation" ADD COLUMN     "previousReservationId" UUID,
ADD COLUMN     "renewalKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CreditReservation_renewalKey_key" ON "CreditReservation"("renewalKey");
