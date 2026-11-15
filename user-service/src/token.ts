/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-09
 * Scope: JWT_SECRET and JWT_ACCESS_TOKEN_TTL are now read through config.ts.
 *        This disclosure covers only that change.
 * Author review: Reviewed and approved by @t-leongchuan
 */
import jwt from "jsonwebtoken";
import { loadAppConfig } from "./config";

const { jwtSecret: JWT_SECRET, accessTokenTtlSeconds } = loadAppConfig();

export const ACCESS_TOKEN_TTL_SECONDS = accessTokenTtlSeconds;

// Payload is only the account id (sub) plus iat/exp. Role is deliberately NOT included:
// /auth/verify reads the current role from the DB, so a token can never carry a stale role.
export function signAccessToken(userId: string): string {
  return jwt.sign({}, JWT_SECRET, {
    subject: userId,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    algorithm: "HS256",
  });
}

// Returns the account id if the token's signature and expiry are valid, otherwise null.
// algorithms is pinned to HS256 so a token claiming "alg: none" (no signature) is rejected.
export function verifyAccessToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    if (typeof payload === "string" || typeof payload.sub !== "string") {
      return null;
    }
    return payload.sub;
  } catch {
    return null; // bad signature, expired, malformed: all treated the same
  }
}
