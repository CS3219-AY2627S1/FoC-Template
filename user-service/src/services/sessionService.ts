import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../db';
import { env } from '../env';

const DAY_MS = 24 * 60 * 60 * 1000;

// SHA-256, not bcrypt: the token is 256 random bits so it can't be brute-forced,
// and an unsalted hash lets us look the row up by hash.
function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

// A fresh raw token + its expiry (sliding: every new token gets the full TTL).
function newToken() {
  return {
    token: randomBytes(32).toString('hex'),
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS),
  };
}

// Starts a session. Returns the raw token for the cookie; only its hash is stored.
export async function createSession(userId: string) {
  const { token, expiresAt } = newToken();

  // Cleanup: this user's ended sessions (logged out or expired) are never read
  // again, so drop them whenever the user starts a new one. Keeps the table bounded.
  await prisma.refreshToken.deleteMany({
    where: { userId, OR: [{ revokedAt: { not: null } }, { expiresAt: { lte: new Date() } }] },
  });

  await prisma.refreshToken.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  });

  return { token, expiresAt };
}

// Swaps a valid refresh token for a new one on the same session row (single
// use), returning the user's current roles so the new access token reflects
// any role changes.
export async function rotateSession(token: string) {
  const hash = hashToken(token);
  const now = new Date();

  // Read before swapping: if a logout lands in between, the swap's WHERE fails,
  // so we never sign an access token for a session that just ended.
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash: hash },
    select: { 
      id: true, 
      userId: true, 
      user: { 
        select: { roles: true, isDeleted: true } 
      } },
  });

  if (row && !row.user.isDeleted) {
    const next = newToken();
    // Atomic check-and-swap. Concurrent refreshes/logouts on this session wait
    // on the row lock, then re-check this WHERE — only one of them wins.
    const { count } = await prisma.refreshToken.updateMany({
      where: { id: row.id, tokenHash: hash, revokedAt: null, expiresAt: { gt: now } },
      data: { tokenHash: hashToken(next.token), previousTokenHash: hash, expiresAt: next.expiresAt },
    });

    if (count === 1) {
      return {
        ok: true as const,
        userId: row.userId,
        roles: row.user.roles,
        token: next.token,
        expiresAt: next.expiresAt,
      };
    }
  }

  // Superseded: a concurrent refresh just rotated this token on a still-live
  // session, so the browser already holds the newer cookie — the caller must
  // not clear it. Only one step back is remembered; anything older is invalid.
  const superseded = await prisma.refreshToken.findFirst({
    where: { previousTokenHash: hash, revokedAt: null, expiresAt: { gt: now } },
    select: { id: true },
  });

  return { ok: false as const, reason: superseded ? ('superseded' as const) : ('invalid' as const) };
}

// Ends the session holding this token — current or just-rotated, so a logout
// racing a refresh still ends the session. No-op if unknown or already revoked.
export async function revokeSession(token: string) {
  const hash = hashToken(token);
  await prisma.refreshToken.updateMany({
    where: { OR: [{ tokenHash: hash }, { previousTokenHash: hash }], revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
