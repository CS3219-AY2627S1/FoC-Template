// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-26
// 26/09/2026: Stage 7 - per-file env, throwaway JWT keys, email mock, pool cleanup
// Author review:
// 2026-11-10: Stage 31b - added sendUnlockEmail to the global email.service.js mock, since
//   triggerUnlockEmail (auth.service.ts) calls it unconditionally on every login-lockout hit,
//   including in existing Stage 18 lockout tests. Tool: Claude Code (model: claude-fable-5-1).
//   Governing decision: instructions.md Stage 31 (changes table row 10). No requirements,
//   architecture, schema, or API decisions were made by the AI tool.
// Author review:
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { afterAll, vi } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(root, '.env.test') });

// Throwaway RS256 key pair, so tests do not depend on the gitignored keys/ folder.
const keyDir = join(tmpdir(), 'foc-user-service-test-keys');
const privatePath = join(keyDir, 'private.pem');
const publicPath = join(keyDir, 'public.pem');
if (!existsSync(privatePath) || !existsSync(publicPath)) {
  mkdirSync(keyDir, { recursive: true });
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  writeFileSync(privatePath, privateKey);
  writeFileSync(publicPath, publicKey);
}
process.env.JWT_PRIVATE_KEY_PATH = privatePath;
process.env.JWT_PUBLIC_KEY_PATH = publicPath;

// Email is mocked for every file (OTP capture and forced failures). email.service.test.ts
// loads the real module with vi.importActual.
vi.mock('../../src/services/email.service.js', () => ({
  sendOtpEmail: vi.fn(async () => {}),
  // Stage 31b: triggerUnlockEmail (auth.service.ts) calls this unconditionally whenever the
  // login lockout threshold is hit, so every existing Stage 18 lockout test needs it mocked
  // too, not just the new Stage 31 ones.
  sendUnlockEmail: vi.fn(async () => {}),
}));

afterAll(async () => {
  const { default: pool } = await import('../../src/db/pool.js');
  await pool.end();
});
