/*
 * AI Assistance Disclosure:
 * Tool: Copilot SDK (model: unspecified by runtime), date: 2026-10-20
 * Scope: Implemented Order Service Bearer-token authentication against the recorded User Service
 *        JWKS contract, including cached key lookup and rotation refresh. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 *
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope: Issue #6 - moved the token check out of the middleware into an exported
 *        createTokenVerifier (same checks, same 401 behaviour) so the Socket.IO handshake
 *        reuses it (George, 2026-10-20: keep Wen Xi's auth); it also returns `exp` for the
 *        disconnect-at-expiry rule. createAuthenticate optionally takes a verifier.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 */

import {
  createPublicKey,
  createVerify,
  type JsonWebKey,
  type KeyObject,
} from 'node:crypto';
import type { RequestHandler } from 'express';

const CACHE_TTL_MS = 5 * 60 * 1000;

type JwksResponse = { keys?: JsonWebKey[] };
type CachedKeys = { expiresAt: number; keys: Map<string, KeyObject> };
type JwtPayload = { sub?: unknown; exp?: unknown; role?: unknown };

const unauthorized = (res: Parameters<RequestHandler>[1]): void => {
  res.status(401).json({ message: 'Unauthorized', code: 'UNAUTHORIZED' });
};

const decodeJson = (value: string): unknown => {
  const decoded = Buffer.from(value, 'base64url').toString('utf8');
  return JSON.parse(decoded) as unknown;
};

const readTokenParts = (
  token: string,
): {
  header: Record<string, unknown>;
  payload: JwtPayload;
  signature: Buffer;
  signingInput: string;
} => {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new Error('Malformed token');
  }

  const header = decodeJson(parts[0]);
  const payload = decodeJson(parts[1]);
  if (
    typeof header !== 'object' ||
    header === null ||
    Array.isArray(header) ||
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload)
  ) {
    throw new Error('Malformed token');
  }

  return {
    header: header as Record<string, unknown>,
    payload: payload as JwtPayload,
    signature: Buffer.from(parts[2], 'base64url'),
    signingInput: parts[0] + '.' + parts[1],
  };
};

const keysFromJwks = (body: unknown): Map<string, KeyObject> => {
  if (
    typeof body !== 'object' ||
    body === null ||
    !Array.isArray((body as JwksResponse).keys)
  ) {
    throw new Error('Invalid JWKS response');
  }

  const keys = new Map<string, KeyObject>();
  for (const jwk of (body as JwksResponse).keys ?? []) {
    if (
      typeof jwk !== 'object' ||
      jwk === null ||
      typeof jwk.kid !== 'string' ||
      jwk.kty !== 'RSA' ||
      typeof jwk.n !== 'string' ||
      typeof jwk.e !== 'string'
    ) {
      continue;
    }
    keys.set(jwk.kid, createPublicKey({ key: jwk, format: 'jwk' }));
  }
  return keys;
};

/** The verified identity: the JWT `sub`, `role` and `exp` (seconds since the epoch). */
export interface VerifiedToken {
  user_id: string;
  role: string;
  exp: number;
}

export type TokenVerifier = (token: string) => Promise<VerifiedToken>;

/**
 * Verifies an RS256 access token against the User Service JWKS (cached, refreshed on an
 * unknown key id). Rejects on any failure. Shared by the REST middleware and the Socket.IO
 * handshake.
 */
export function createTokenVerifier(userServiceUrl: string): TokenVerifier {
  let cache: CachedKeys | null = null;
  let refreshPromise: Promise<Map<string, KeyObject>> | null = null;

  const fetchKeys = async (
    forceRefresh = false,
  ): Promise<Map<string, KeyObject>> => {
    if (!forceRefresh && cache && cache.expiresAt > Date.now()) {
      return cache.keys;
    }
    if (!refreshPromise) {
      refreshPromise = fetch(
        new URL('/auth/.well-known/jwks.json', userServiceUrl),
      )
        .then(async (response) => {
          if (!response.ok)
            throw new Error(`JWKS request failed (${response.status})`);
          return keysFromJwks(await response.json());
        })
        .then((keys) => {
          cache = { keys, expiresAt: Date.now() + CACHE_TTL_MS };
          return keys;
        })
        .finally(() => {
          refreshPromise = null;
        });
    }
    return refreshPromise;
  };

  return async (token) => {
    const { header, payload, signature, signingInput } = readTokenParts(token);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
      throw new Error('Unsupported token');
    }

    let keys = await fetchKeys();
    let key = keys.get(header.kid);
    if (!key) {
      keys = await fetchKeys(true);
      key = keys.get(header.kid);
    }
    if (!key) throw new Error('Unknown key id');

    const verifier = createVerify('RSA-SHA256');
    verifier.update(signingInput);
    verifier.end();
    if (!verifier.verify(key, signature)) throw new Error('Invalid signature');

    if (
      typeof payload.sub !== 'string' ||
      !payload.sub ||
      typeof payload.exp !== 'number' ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      throw new Error('Invalid claims');
    }

    return {
      user_id: payload.sub,
      role: typeof payload.role === 'string' ? payload.role : '',
      exp: payload.exp,
    };
  };
}

export function createAuthenticate(
  userServiceUrl: string,
  verifyToken: TokenVerifier = createTokenVerifier(userServiceUrl),
): RequestHandler {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      unauthorized(res);
      return;
    }

    try {
      const { user_id, role } = await verifyToken(
        authHeader.slice('Bearer '.length).trim(),
      );
      req.user = { user_id, role };
      next();
    } catch {
      unauthorized(res);
    }
  };
}
