-- AI Assistance Disclosure:
-- Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
-- Scope: Migration for issue #11 per George's decisions (2026-10-20): existing order rows
--        are deleted (dev data; free-text locations cannot be mapped to ids), the text
--        `deliveryLocation` is replaced by `deliveryLocationId` INTEGER (supplier-service
--        location id, matching supplierId), and indexes are added on credits, completeBy and deliveryLocationId.
--        Hand-written (prisma migrate dev unavailable in the AI workspace).
--        No requirements, architecture, schema, or API decisions were made by the AI tool.
-- Author review: george-yeo

-- Existing rows have free-text locations with no mapping to supplier location ids.
DELETE FROM "requests";

-- AlterTable
ALTER TABLE "requests" DROP COLUMN "deliveryLocation",
ADD COLUMN "deliveryLocationId" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "requests_credits_idx" ON "requests"("credits");

-- CreateIndex
CREATE INDEX "requests_completeBy_idx" ON "requests"("completeBy");

-- CreateIndex
CREATE INDEX "requests_deliveryLocationId_idx" ON "requests"("deliveryLocationId");
