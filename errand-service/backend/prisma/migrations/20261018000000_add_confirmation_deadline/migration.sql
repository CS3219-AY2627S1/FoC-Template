ALTER TABLE "errands" ADD COLUMN "confirmationDeadline" TIMESTAMP(3);

CREATE INDEX "errands_status_confirmationDeadline_idx"
ON "errands"("status", "confirmationDeadline");
