/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-04
 * Scope: Phase 5 Task 3 helper. Serves a local JWKS at /auth/.well-known/jwks.json (the path the
 *        Supplier Service already fetches) and writes a user and an admin RS256 token to the file
 *        named by TOKEN_FILE, so the load test can run without the real User Service. Test-only keys,
 *        generated in memory. No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 */
import { createSign, generateKeyPairSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:http';

const { PORT = '3991', TOKEN_FILE } = process.env;
if (!TOKEN_FILE) throw new Error('TOKEN_FILE is required');
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const kid = 'load-test';
const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
const mint = (role: string) => {
  const input = `${encode({ alg: 'RS256', typ: 'JWT', kid })}.${encode({ sub: `load-${role}`, role, exp: Math.floor(Date.now() / 1000) + 6 * 3600 })}`;
  const signer = createSign('RSA-SHA256');
  signer.update(input);
  signer.end();
  return `${input}.${signer.sign(privateKey).toString('base64url')}`;
};
writeFileSync(TOKEN_FILE, JSON.stringify({ user: mint('user'), admin: mint('admin') }));
const jwks = JSON.stringify({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256' }] });
createServer((_req, res) => { res.setHeader('content-type', 'application/json'); res.end(jwks); })
  .listen(Number(PORT), () => console.log(`JWKS on :${PORT}, tokens in ${TOKEN_FILE}`));
