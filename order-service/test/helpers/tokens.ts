/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope: Issue #6 - test-only RS256 key pair and token signer (no key material is
 *        committed). Each key set is published on a local JWKS endpoint so the tests
 *        exercise the production verifier (Wen Xi's createTokenVerifier) end to end.
 *        Uses node:crypto only.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 */

import { generateKeyPairSync, sign as rsaSign } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RequestHandler } from 'express';
import {
  createAuthenticate,
  createTokenVerifier,
  type TokenVerifier,
} from '../../src/middleware/authenticate.js';

const KID = 'test-key';

export interface TestKeys {
  /** The production verifier, reading this key set's local JWKS endpoint. */
  verifier: TokenVerifier;
  /** The production REST middleware over the same verifier. */
  authenticate: RequestHandler;
  /** `expiresIn`: absolute exp in epoch seconds, or minutes as '5m' (default). */
  sign(
    userId: string,
    opts?: { expiresIn?: string | number; role?: string },
  ): Promise<string>;
  close(): Promise<void>;
}

const b64 = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

/** A fresh key pair per call, served at <url>/auth/.well-known/jwks.json. */
export async function createTestKeys(): Promise<TestKeys> {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const jwk = {
    ...publicKey.export({ format: 'jwk' }),
    kid: KID,
    alg: 'RS256',
    use: 'sig',
  };

  const server: Server = createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const verifier = createTokenVerifier(url);

  return {
    verifier,
    authenticate: createAuthenticate(url, verifier),
    sign: async (userId, { expiresIn = '5m', role = 'user' } = {}) => {
      const now = Math.floor(Date.now() / 1000);
      const exp =
        typeof expiresIn === 'number'
          ? expiresIn
          : now + Number.parseInt(expiresIn, 10) * 60;
      const signingInput = `${b64({ alg: 'RS256', kid: KID, typ: 'JWT' })}.${b64(
        { sub: userId, role, iat: now, exp },
      )}`;
      const signature = rsaSign(
        'RSA-SHA256',
        Buffer.from(signingInput),
        privateKey,
      ).toString('base64url');
      return `${signingInput}.${signature}`;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** HTTP specs with a stub authenticate middleware: the bearer token is the user id. */
export const bearer = (userId: string) => `Bearer ${userId}`;
