BEGIN;

-- Validate existing balances without modifying or provisioning any accounts.
ALTER TABLE "CreditAccount"
    ADD CONSTRAINT "CreditAccount_availableCredits_nonnegative" CHECK ("availableCredits" >= 0),
    ADD CONSTRAINT "CreditAccount_reservedCredits_nonnegative" CHECK ("reservedCredits" >= 0);

CREATE TYPE "CreditTransactionType" AS ENUM (
    'INITIAL_ALLOCATION',
    'RESERVATION',
    'TRANSFER_SENT',
    'TRANSFER_RECEIVED',
    'RELEASE',
    'REFUND'
);

CREATE TABLE "CreditTransaction" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "type" "CreditTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "availableDelta" INTEGER NOT NULL,
    "reservedDelta" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderId" UUID,
    "idempotencyKey" TEXT NOT NULL,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CreditTransaction_amount_positive" CHECK ("amount" > 0),
    CONSTRAINT "CreditTransaction_accountId_fkey"
        FOREIGN KEY ("accountId") REFERENCES "CreditAccount"("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "CreditTransaction_idempotencyKey_key"
    ON "CreditTransaction"("idempotencyKey");

-- SQL-managed invariant: other transaction types may repeat for an account.
CREATE UNIQUE INDEX "CreditTransaction_initial_allocation_account_key"
    ON "CreditTransaction"("accountId")
    WHERE "type" = 'INITIAL_ALLOCATION';

CREATE INDEX "CreditTransaction_accountId_createdAt_id_idx"
    ON "CreditTransaction"("accountId", "createdAt" DESC, "id" DESC);

CREATE INDEX "CreditTransaction_accountId_type_createdAt_id_idx"
    ON "CreditTransaction"("accountId", "type", "createdAt" DESC, "id" DESC);

-- Corrections must be new ledger entries, never edits to historical entries.
CREATE FUNCTION "reject_credit_transaction_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'CreditTransaction is append-only; % is not allowed', TG_OP
        USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "CreditTransaction_append_only"
    BEFORE UPDATE OR DELETE OR TRUNCATE ON "CreditTransaction"
    FOR EACH STATEMENT
    EXECUTE FUNCTION "reject_credit_transaction_mutation"();

COMMIT;
