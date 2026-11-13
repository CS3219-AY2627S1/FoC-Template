-- AI Assistance Disclosure:
-- Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-14
-- Scope: Generated the initial credit balance and transaction schema migration.
-- Author review: Verified correctness and that it matches schema.prisma

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INITIAL_ALLOCATION', 'CREDIT_RESERVE', 'CREDIT_RELEASE', 'CREDIT_TRANSFER', 'USER_DELETION');

-- CreateTable
CREATE TABLE "credit_balances" (
    "user_id" TEXT NOT NULL,
    "available_credit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "reserve_credit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "last_updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_balances_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "transaction_records" (
    "reference" TEXT NOT NULL,
    "time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sender_id" TEXT NOT NULL,
    "receiver_id" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "transaction_records_pkey" PRIMARY KEY ("reference")
);

-- CreateIndex
CREATE INDEX "transaction_records_sender_id_time_idx" ON "transaction_records"("sender_id", "time");

-- CreateIndex
CREATE INDEX "transaction_records_receiver_id_time_idx" ON "transaction_records"("receiver_id", "time");
