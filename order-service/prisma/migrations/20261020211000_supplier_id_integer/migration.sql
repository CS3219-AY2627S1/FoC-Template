/*
  Widening the supplier identifier contract from UUID to the supplier service's
  positive integer identifier. Existing UUID supplier references cannot be
  translated reliably, so this intentionally replaces the external reference
  column; the order seed is updated with integer supplier IDs.
*/
ALTER TABLE "requests" DROP COLUMN "supplierId";

ALTER TABLE "requests" ADD COLUMN "supplierId" INTEGER NOT NULL;
