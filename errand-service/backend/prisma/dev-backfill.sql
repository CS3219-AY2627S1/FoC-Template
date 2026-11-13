-- A fresh development database has no table to backfill. Prisma db push
-- creates it immediately after this script runs.
DO $$
BEGIN
  IF to_regclass('public.errands') IS NULL THEN
    RETURN;
  END IF;
-- Backfill columns introduced after the original local errand schema.
-- This is intentionally idempotent because `npm run dev-be` uses db push
-- against a persistent development database.
  ALTER TABLE "errands"
  ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT 'Unnamed errand',
  ADD COLUMN IF NOT EXISTS "supplierName" TEXT NOT NULL DEFAULT 'Unknown supplier',
  ADD COLUMN IF NOT EXISTS "serviceType" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "targetLat" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "targetLng" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "targetBuildingName" TEXT NOT NULL DEFAULT 'Unknown destination',
  ADD COLUMN IF NOT EXISTS "targetFloorNumber" INTEGER NOT NULL DEFAULT 0;

  UPDATE "errands"
SET
  "name" = LEFT(COALESCE(NULLIF("name", ''), NULLIF("deliveryDescription", ''), 'Unnamed errand'), 200),
  "targetLat" = "pickupLat",
  "targetLng" = "pickupLng",
  "targetBuildingName" = "pickupBuildingName",
  "targetFloorNumber" = "pickupFloorNumber"
WHERE "name" = 'Unnamed errand'
   OR "targetBuildingName" = 'Unknown destination';

  ALTER TABLE "errands"
  ALTER COLUMN "name" DROP DEFAULT,
  ALTER COLUMN "supplierName" DROP DEFAULT,
  ALTER COLUMN "serviceType" DROP DEFAULT,
  ALTER COLUMN "targetLat" DROP DEFAULT,
  ALTER COLUMN "targetLng" DROP DEFAULT,
  ALTER COLUMN "targetBuildingName" DROP DEFAULT,
  ALTER COLUMN "targetFloorNumber" DROP DEFAULT;

END;
$$;
