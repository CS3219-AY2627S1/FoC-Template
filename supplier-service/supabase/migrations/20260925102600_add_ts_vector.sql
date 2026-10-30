ALTER TABLE "public"."Supplier_Database"
ADD COLUMN IF NOT EXISTS fts tsvector
GENERATED ALWAYS AS (to_tsvector('english',  "Name"  || ' ' || "Building" || ' ' || "Location Description")) STORED;

CREATE INDEX IF NOT EXISTS posts_fts_idx ON "Supplier_Database" USING gin (fts);