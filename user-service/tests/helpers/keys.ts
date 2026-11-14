// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-26
// 26/09/2026: Stage 7 - sign test JWTs with the throwaway keys
// Author review:
// 2026-10-17: Stage 13a - default signToken/signExpiredToken to the configured JWT_KEY_ID,
//   since verifyAccessToken now looks keys up by the token header's kid.
// Author review:
// 2026-10-23: Stage 13a test coverage - exported privateKey so jwt.test.ts can sign tokens with
//   the real (known) key but a missing or fabricated kid, to test that lookup path directly
//   instead of only through the unrelated "wrong key pair entirely" case.
// Author review:
// 2026-11-09: Stage 27a - signToken/signExpiredToken/signWithOtherKey now sign header
//   `typ: at+JWT` and claim `sid` by default (access tokens now carry both). Added
//   signElevationToken for the new `ep+JWT` token. Governing decision: instructions.md
//   Stage 27. No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-10: Stage 31e - added signUnlockToken, a test-side `ul+JWT` signer (mirrors
//   signElevationToken) for jwt.test.ts's unlock-token coverage. Governing decision:
//   instructions.md Stage 31a.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import jwt from 'jsonwebtoken';

export const privateKey = () => readFileSync(process.env.JWT_PRIVATE_KEY_PATH!, 'utf8');
export const publicKey = () => readFileSync(process.env.JWT_PUBLIC_KEY_PATH!, 'utf8');

export function signToken(
  claims: { sub?: string; role?: string; sid?: string } = {},
  options: jwt.SignOptions = {},
): string {
  const { sub = 'user-id-1', role = 'user', sid = 'session-id-1' } = claims;
  return jwt.sign({ role, sid }, privateKey(), {
    algorithm: 'RS256',
    subject: sub,
    expiresIn: '15m',
    keyid: process.env.JWT_KEY_ID,
    header: { alg: 'RS256', typ: 'at+JWT' },
    ...options,
  });
}

export function signExpiredToken(claims: { sub?: string; role?: string; sid?: string } = {}): string {
  const { sub = 'user-id-1', role = 'user', sid = 'session-id-1' } = claims;
  return jwt.sign({ role, sid, exp: Math.floor(Date.now() / 1000) - 60 }, privateKey(), {
    algorithm: 'RS256',
    subject: sub,
    keyid: process.env.JWT_KEY_ID,
    header: { alg: 'RS256', typ: 'at+JWT' },
  });
}

// Valid RS256 token, but signed by a key pair the service does not know.
export function signWithOtherKey(claims: { sub?: string; role?: string; sid?: string } = {}): string {
  const { sub = 'user-id-1', role = 'user', sid = 'session-id-1' } = claims;
  const { privateKey: other } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return jwt.sign({ role, sid }, other, {
    algorithm: 'RS256',
    subject: sub,
    expiresIn: '15m',
    header: { alg: 'RS256', typ: 'at+JWT' },
  });
}

// Valid RS256 elevation token (header typ: ep+JWT), signed by the real key.
export function signElevationToken(claims: { sub?: string; role?: string; sid?: string } = {}): string {
  const { sub = 'user-id-1', role = 'user', sid = 'session-id-1' } = claims;
  return jwt.sign({ role, sid }, privateKey(), {
    algorithm: 'RS256',
    subject: sub,
    expiresIn: '15m',
    keyid: process.env.JWT_KEY_ID,
    header: { alg: 'RS256', typ: 'ep+JWT' },
  });
}

// Valid RS256 unlock token (header typ: ul+JWT), signed by the real key.
export function signUnlockToken(claims: { sub?: string; lck?: number } = {}): string {
  const { sub = 'user-id-1', lck = Math.floor(Date.now() / 1000) } = claims;
  return jwt.sign({ lck }, privateKey(), {
    algorithm: 'RS256',
    subject: sub,
    expiresIn: '1h',
    keyid: process.env.JWT_KEY_ID,
    header: { alg: 'RS256', typ: 'ul+JWT' },
  });
}

// Flips the last characters of the signature segment.
export function tamperSignature(token: string): string {
  const [h, p, s] = token.split('.');
  const flipped = s!.slice(0, -4) + (s!.endsWith('AAAA') ? 'BBBB' : 'AAAA');
  return `${h}.${p}.${flipped}`;
}
