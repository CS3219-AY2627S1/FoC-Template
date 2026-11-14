-- AI Assistance Disclosure:
-- Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
-- Scope: `failed` status for orders whose credit reservation failed (George, 2026-10-20).
--        Hand-written (prisma migrate dev unavailable in the AI workspace).
--        No requirements, architecture, schema, or API decisions were made by the AI tool.
-- Author review: george-yeo

-- AlterEnum
ALTER TYPE "RequestStatus" ADD VALUE 'failed';
