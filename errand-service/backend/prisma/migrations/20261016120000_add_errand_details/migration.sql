ALTER TABLE "errands"
  ADD COLUMN "name" TEXT NOT NULL DEFAULT 'Unnamed errand',
  ADD COLUMN "supplierName" TEXT NOT NULL DEFAULT 'Unknown supplier',
  ADD COLUMN "serviceType" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "targetLat" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "targetLng" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "targetBuildingName" TEXT NOT NULL DEFAULT 'Unknown destination',
  ADD COLUMN "targetFloorNumber" INTEGER NOT NULL DEFAULT 0;

UPDATE "errands"
SET
  "name" = LEFT(COALESCE(NULLIF("name", ''), NULLIF("deliveryDescription", ''), 'Unnamed errand'), 200),
  "targetLat" = "pickupLat",
  "targetLng" = "pickupLng",
  "targetBuildingName" = "pickupBuildingName",
  "targetFloorNumber" = "pickupFloorNumber";

ALTER TABLE "errands"
  ALTER COLUMN "name" DROP DEFAULT,
  ALTER COLUMN "supplierName" DROP DEFAULT,
  ALTER COLUMN "serviceType" DROP DEFAULT,
  ALTER COLUMN "targetLat" DROP DEFAULT,
  ALTER COLUMN "targetLng" DROP DEFAULT,
  ALTER COLUMN "targetBuildingName" DROP DEFAULT,
  ALTER COLUMN "targetFloorNumber" DROP DEFAULT;
