// AI Assistance Disclosure:
// Tool: OpenAI Codex, 2026-11-02 (Asia/Singapore).
// Scope: Added the author-specified expired ArchivedUser purge job, including
// startup execution and daily scheduling. Author reviewed the changes line by
// line, manually tested and confirmed the behaviour, approved the
// implementation. See user-service/ai/usage-log.md, entry 030.

import { prisma } from '../db';

export const ARCHIVE_PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

export async function purgeExpiredArchivedUsers(): Promise<number> {
  const result = await prisma.archivedUser.deleteMany({
    where: { purgeAfter: { lte: new Date() } },
  });
  return result.count;
}

export function startArchivePurgeJob(
  intervalMs = ARCHIVE_PURGE_INTERVAL_MS,
  purge = purgeExpiredArchivedUsers,
): () => void {
  let inFlight = false;

  const timer = setInterval(() => {
    if (inFlight) return;
    inFlight = true;
    void purge()
      .catch((err) => {
        console.error('ArchivedUser purge failed', err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        inFlight = false;
      });
  }, intervalMs);

  return () => clearInterval(timer);
}
