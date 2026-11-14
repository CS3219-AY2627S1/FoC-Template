/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-04
 * Scope: Phase 5 Task 4/5 setup. Starts a local JWKS stub on JWKS_PORT (default 3991) at the path the
 *        Supplier Service already fetches, and hands the suite one test token per role. The service under
 *        test must be started with USER_SERVICE_URL pointing at this stub. Test-only keys, in memory.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 */
import { createSign, generateKeyPairSync } from 'node:crypto';
import { createServer } from 'node:http';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    tokens: Record<'user' | 'admin' | 'super admin', string>;
  }
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  // unique per run: a service that already cached an earlier run's JWKS must see an unknown kid and refetch
  const kid = `api-demo-${Date.now()}`;
  const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const mint = (role: string) => {
    const input = `${encode({ alg: 'RS256', typ: 'JWT', kid })}.${encode({ sub: `demo-${role}`, role, exp: Math.floor(Date.now() / 1000) + 3600 })}`;
    const signer = createSign('RSA-SHA256');
    signer.update(input);
    signer.end();
    return `${input}.${signer.sign(privateKey).toString('base64url')}`;
  };
  project.provide('tokens', { user: mint('user'), admin: mint('admin'), 'super admin': mint('super admin') });

  const jwks = JSON.stringify({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256' }] });
  const server = createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(jwks);
  });
  await new Promise<void>((done) => server.listen(Number(process.env.JWKS_PORT ?? 3991), done));
  return () => new Promise<void>((done) => { server.close(() => done()); });
}
