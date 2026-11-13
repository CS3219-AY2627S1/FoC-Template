// ChatGPT (Codex), 2026-11-03: Move HTTP handling to Order controller and reuse singleton database client; review pending.
// AI Assistance Disclosure: ChatGPT (Codex), 2026-11-02.
// Scope: CSV catalogue lookup and user-defined search contract; review pending.
// See ../../../usage-log.md.
import type { Prisma } from '../generated/prisma';
import { prisma } from '../db';

type Database = Pick<Prisma.TransactionClient, 'destinationLocation'>;

// Exact names remain supported for existing clients, but must exist in the catalogue.
// An ID/name mismatch is rejected rather than saving caller-supplied display text.
export async function resolveDestination(db: Database, name: string, id?: string) {
  const location = id
    ? await db.destinationLocation.findUnique({ where: { id } })
    : await db.destinationLocation.findFirst({ where: { name }, orderBy: { id: 'asc' } });
  return location && location.name === name ? location : null;
}

// Database access stays in the service layer and reuses the application's client.
export function searchDestinationLocations(query: string, limit: number) {
  const term = query.replace(/[\\%_]/g, '\\$&');
  return prisma.destinationLocation.findMany({
    where: { OR: [
      { name: { contains: term, mode: 'insensitive' } },
      { aliases: { contains: term, mode: 'insensitive' } },
    ] },
    select: { id: true, name: true, code: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }], take: limit,
  });
}
