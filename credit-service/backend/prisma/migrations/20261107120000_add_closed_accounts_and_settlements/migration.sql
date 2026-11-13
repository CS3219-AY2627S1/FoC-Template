-- Preserve deleted accounts for system settlement while keeping them hidden
-- from normal credit reads.
CREATE TYPE "CreditAccountStatus" AS ENUM ('ACTIVE', 'CLOSED');

ALTER TABLE "credit_balances"
  ADD COLUMN "status" "CreditAccountStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE TYPE "SettlementStatus" AS ENUM ('CREDITED', 'PENDING');

CREATE TABLE "credit_settlements" (
    "reference" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "receiver_id" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'CREDITED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_settlements_pkey" PRIMARY KEY ("reference")
);

CREATE INDEX "credit_settlements_receiver_id_status_idx"
  ON "credit_settlements"("receiver_id", "status");
