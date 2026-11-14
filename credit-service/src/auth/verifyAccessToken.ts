// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-10-19
//  2026-10-19: Week 9 - JWKS token verification with jose, per
//    user-service/docs/jwks-verification-guide.md and the team's decisions of
//    2026-10-19 (jose + createRemoteJWKSet; RS256 pinned; an unreachable key set
//    must not look like a bad credential).
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

import { createRemoteJWKSet, jwtVerify, errors as joseErrors } from 'jose';
import { AppError } from '../utils/AppError.js';
import type { AuthenticatedUser } from './roleRank.js';

export type TokenVerifier = (bearerToken: string) => Promise<AuthenticatedUser>;

/**
 * True when the failure was reaching user-service at all, rather than anything about
 * the token.
 *
 * The distinction matters: a user-service outage would otherwise be indistinguishable
 * from a wrong password, and every caller would be told to log in again during an
 * incident they cannot fix (team decision 2026-10-19).
 *
 * Deliberately a allowlist of transport failures. Anything unrecognised falls through
 * to 401, because treating an unknown verification failure as "the identity provider is
 * down" would turn a genuine auth bug into an availability excuse.
 */
function isKeySetUnreachable(err: unknown): boolean {
  if (err instanceof joseErrors.JWKSTimeout) return true;
  if (!(err instanceof Error)) return false;

  // undici surfaces connection failures as TypeError('fetch failed') with a cause.
  const cause = (err as { cause?: { code?: unknown } }).cause;
  const causeCode = typeof cause?.code === 'string' ? cause.code : '';
  if (
    ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(
      causeCode,
    )
  ) {
    return true;
  }
  return err.name === 'TypeError' && err.message.toLowerCase().includes('fetch failed');
}

/**
 * Builds a verifier bound to one JWKS URL.
 *
 * `createRemoteJWKSet` does the caching, `kid` lookup and refetch-on-miss the guide
 * describes, with its own cooldown so a miss cannot be used to hammer user-service.
 * The URL is a parameter rather than read from config so tests can point it at a stub
 * key set and never need a live user-service.
 */
export function createJwksVerifier(jwksUrl: URL): TokenVerifier {
  const keySet = createRemoteJWKSet(jwksUrl);

  return async (bearerToken: string): Promise<AuthenticatedUser> => {
    let payload;
    try {
      // RS256 is pinned here. The token's own `alg` header never decides how it is
      // verified — that is the substitution attack the guide warns about.
      ({ payload } = await jwtVerify(bearerToken, keySet, { algorithms: ['RS256'] }));
    } catch (err) {
      if (isKeySetUnreachable(err)) {
        throw new AppError(
          503,
          'Cannot reach the identity provider to verify your session. Try again shortly.',
          'IDENTITY_PROVIDER_UNAVAILABLE',
        );
      }
      throw new AppError(401, 'Authentication required.', 'UNAUTHORIZED');
    }

    // The two claims the guide names: `sub` (the user id) and `role`.
    const { sub, role } = payload;
    if (typeof sub !== 'string' || typeof role !== 'string') {
      throw new AppError(401, 'Authentication required.', 'UNAUTHORIZED');
    }

    return { userId: sub, role };
  };
}
