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
