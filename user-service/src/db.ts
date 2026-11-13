// AI Assistance Disclosure:
// Tool: Claude Code (Claude Opus), date: 2026-09-25
// Scope: AI generated the Prisma client and the DB liveness probe.
// Author review: Author approved the health probe and reviewed the code. See
// user-service/ai/usage-log.md, entry 001.

import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

// Lightweight DB liveness probe used by the health check.
export async function pingDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
