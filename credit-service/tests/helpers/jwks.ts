// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-10-19
//  2026-10-19: Week 9 - throwaway keypair and stub JWKS server, so the suite never
//    needs a live user-service.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

import { createServer, type Server } from 'node:http';
import { SignJWT, exportJWK, generateKeyPair, type KeyObject } from 'jose';

const KID = 'test-key';

let privateKey: KeyObject | CryptoKey;
let server: Server;
let requestCount = 0;

/**
 * Serves a JWKS at the path user-service publishes, on the port .env.test points at.
 *
 * Generated fresh per run: no key material is committed, and nothing here is the real
 * user-service key.
 */
export async function startStubJwks(): Promise<void> {
  const { publicKey, privateKey: priv } = await generateKeyPair('RS256', { extractable: true });
  privateKey = priv;
  const jwk = { ...(await exportJWK(publicKey)), kid: KID, use: 'sig', alg: 'RS256' };

  const port = Number(new URL(process.env.USER_SERVICE_URL!).port);
  server = createServer((req, res) => {
    if (req.url === '/auth/.well-known/jwks.json') {
      requestCount += 1;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    res.writeHead(404).end();
  });

  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
}

export async function stopStubJwks(): Promise<void> {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
}

/** How many times the key set has been fetched — used to prove it is cached. */
export const jwksFetchCount = (): number => requestCount;

/** A token user-service would issue: RS256, `kid` in the header, `sub` and `role`. */
export async function signToken(
  userId: string,
  role = 'user',
  options: { expiresIn?: string; kid?: string } = {},
): Promise<string> {
  return new SignJWT({ role })
    .setProtectedHeader({ alg: 'RS256', kid: options.kid ?? KID })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '5m')
    .sign(privateKey);
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
