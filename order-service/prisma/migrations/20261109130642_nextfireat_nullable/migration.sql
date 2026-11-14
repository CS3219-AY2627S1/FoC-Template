-- AI Assistance Disclosure:
-- Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
-- Scope: Stage 28 f (instructions.md) - makes OrderSeries.nextFireAt nullable, per the
--        team's decision (2026-11-09) to fix Stage 28a's migration (which had made it
--        NOT NULL, disagreeing with instructions.md's "nextFireAt (nullable)" design and
--        the "finished series: deleted ... when nextFireAt is null" rule) with a follow-up
--        migration rather than a sentinel value.
--        No requirements, architecture, schema, or API decisions were made by the AI tool.
-- Author review:

-- AlterTable
ALTER TABLE "order_series" ALTER COLUMN "nextFireAt" DROP NOT NULL;
