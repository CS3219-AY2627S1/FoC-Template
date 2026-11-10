CREATE TYPE "ReservationStatus" AS ENUM ('RESERVED','TRANSFERRED','RELEASED','REFUNDED','ABORTED');
CREATE TYPE "SettlementReason" AS ENUM ('RECEIVED','CANCELED','EXPIRED','FAILED','CREATION_ABORTED');
CREATE TABLE "CreditReservation" (
 "id" UUID PRIMARY KEY, "orderId" UUID NOT NULL, "requesterId" UUID NOT NULL,
 "amount" INTEGER NOT NULL CHECK ("amount" > 0),
 "status" "ReservationStatus" NOT NULL DEFAULT 'RESERVED', "courierId" UUID,
 "settlementEventId" UUID UNIQUE, "settlementReason" "SettlementReason", "settlementPayload" JSONB,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(6) NOT NULL,
 "settledAt" TIMESTAMPTZ(6), "accountId" UUID,
 CONSTRAINT "CreditReservation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CreditAccount"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "CreditReservation_one_active_order" ON "CreditReservation"("orderId") WHERE "status" = 'RESERVED';
CREATE INDEX "CreditReservation_orderId_createdAt_idx" ON "CreditReservation"("orderId", "createdAt");
CREATE INDEX "CreditReservation_status_createdAt_idx" ON "CreditReservation"("status", "createdAt");
ALTER TABLE "CreditTransaction" ADD COLUMN "reservationId" UUID;
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "CreditReservation"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX "CreditTransaction_reservationId_accountId_type_key" ON "CreditTransaction"("reservationId", "accountId", "type");
