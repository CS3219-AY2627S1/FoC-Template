// AI Assistance Disclosure: ChatGPT (Codex), 2026-10-21.
// Scope: Generated setup implementation following approved User Service conventions.
// Author review: Pending; see ../../usage-log.md.
import { PrismaClient } from './generated/prisma';

export const prisma = new PrismaClient();

export async function pingDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
