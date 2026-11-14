/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-09
 * Scope: Prisma CLI configuration for applying the SQL migrations, mirroring order-service.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});
