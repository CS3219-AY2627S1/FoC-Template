CREATE UNIQUE INDEX "unique_active_supplier_name" ON "Supplier_Database" ("Name") WHERE "deleted_at" IS NULL;

ALTER TABLE public."Supplier_Database"
  ALTER COLUMN updated_at TYPE timestamptz(3);