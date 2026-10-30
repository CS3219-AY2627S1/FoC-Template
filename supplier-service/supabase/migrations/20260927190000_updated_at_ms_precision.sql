-- updated_at doubles as the optimistic concurrency token on PUT /supplier/:id.
-- Postgres keeps timestamptz at microsecond precision, but a JS Date only carries
-- milliseconds, so a value read by the API and sent back unchanged would never match
-- on equality. Pinning the column to millisecond precision makes the round trip exact.

alter table public."Supplier_Database"
  alter column updated_at type timestamptz(3);
