// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-26
// 26/09/2026: Stage 7 - unit tests for jwt.ts (claim shape, algorithm, verification)
// Author review:
// 2026-10-23: Stage 13a - added getJwks() unit coverage and the two kid-lookup failure modes
//   (missing kid, unknown kid) using the real signing key directly, per instructions.md Stage
//   13a's own Verification bullets. These were previously only exercised indirectly through
//   the GET /auth/.well-known/jwks.json controller test and signWithOtherKey (which conflates
//   "no kid" with "wrong key entirely" since it never sets a kid at all).
// Author review:
// 2026-11-09: Stage 27a - signAccessToken/verifyAccessToken now also carry `sid` and header
//   `typ: at+JWT`; added coverage for the new header `typ` rejection (elevation token, plain
//   JWT) and for signElevationToken/verifyElevationToken (RS256, sub/role/sid/iat/exp, sid
//   mismatch). Governing decision: instructions.md Stage 27. No requirements, architecture,
//   schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-10: Stage 31e - added coverage for signUnlockToken/verifyUnlockToken (Stage 31a):
//   claim shape (sub/iat/exp/lck), the 1 hour expiry, cross-type rejection in both directions
//   (verifyAccessToken/verifyElevationToken reject ul+JWT; verifyUnlockToken rejects at+JWT,
//   ep+JWT and a plain JWT), and the existing expired/bad-signature cases applied to the new
//   verifier. Governing decision: instructions.md Stage 31a's own Verification bullets.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import {
  getJwks,
  signAccessToken,
  signElevationToken,
  signUnlockToken,
  verifyAccessToken,
  verifyElevationToken,
  verifyUnlockToken,
} from '../../src/utils/jwt.js';
import {
  privateKey,
  publicKey,
  signElevationToken as signTestElevationToken,
  signExpiredToken,
  signToken,
  signUnlockToken as signTestUnlockToken,
  signWithOtherKey,
  tamperSignature,
} from '../helpers/keys.js';

describe('signAccessToken', () => {
  it('produces an RS256 token (header typ: at+JWT) with claims { sub, role, sid } and a ~15 minute expiry', () => {
    const token = signAccessToken({ userId: 'abc', role: 'admin', sid: 'sid-1' });
    const decoded = jwt.decode(token, { complete: true })!;
    const payload = decoded.payload as jwt.JwtPayload;

    expect(decoded.header.alg).toBe('RS256');
    expect(decoded.header.typ).toBe('at+JWT');
    expect(payload.sub).toBe('abc');
    expect(payload.role).toBe('admin');
    expect(payload.sid).toBe('sid-1');
    expect(payload.exp! - payload.iat!).toBe(15 * 60);
    expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'role', 'sid', 'sub']);
  });

  it('is verifiable with the public key', () => {
    const token = signAccessToken({ userId: 'abc', role: 'user', sid: 'sid-1' });
    expect(() => jwt.verify(token, publicKey(), { algorithms: ['RS256'] })).not.toThrow();
  });
});

describe('verifyAccessToken', () => {
  it('returns { user_id, role, sid } from a valid token', () => {
    expect(verifyAccessToken(signToken({ sub: 'u1', role: 'super admin', sid: 'sid-9' }))).toEqual({
      user_id: 'u1',
      role: 'super admin',
      sid: 'sid-9',
    });
  });

  it('throws on an expired token', () => {
    expect(() => verifyAccessToken(signExpiredToken())).toThrow();
  });

  it('throws on a tampered signature', () => {
    expect(() => verifyAccessToken(tamperSignature(signToken()))).toThrow();
  });

  it('throws on a token signed by a different key pair', () => {
    expect(() => verifyAccessToken(signWithOtherKey())).toThrow();
  });

  it('throws on garbage', () => {
    expect(() => verifyAccessToken('not-a-jwt')).toThrow();
    expect(() => verifyAccessToken('')).toThrow();
  });

  it('rejects an HS256 token signed with the public key (algorithm pinned to RS256)', () => {
    const forged = jwt.sign({ role: 'super admin', sid: 'sid-1' }, publicKey(), {
      algorithm: 'HS256',
      subject: 'attacker',
      expiresIn: '15m',
      header: { alg: 'HS256', typ: 'at+JWT' },
    });
    expect(() => verifyAccessToken(forged)).toThrow();
  });

  it('rejects an unsigned (alg none) token', () => {
    const forged = jwt.sign({ role: 'super admin' }, '', {
      algorithm: 'none',
      subject: 'attacker',
      header: { alg: 'none', typ: 'at+JWT' },
    });
    expect(() => verifyAccessToken(forged)).toThrow();
  });

  it('throws on a token with no kid header at all, even when signed by the real key', () => {
    const noKid = jwt.sign({ role: 'user', sid: 'sid-1' }, privateKey(), {
      algorithm: 'RS256',
      subject: 'u1',
      expiresIn: '15m',
      header: { alg: 'RS256', typ: 'at+JWT' },
    });
    expect(jwt.decode(noKid, { complete: true })!.header.kid).toBeUndefined();
    expect(() => verifyAccessToken(noKid)).toThrow();
  });

  it('throws on a token whose kid matches neither known key, even when signed by the real key', () => {
    const unknownKid = jwt.sign({ role: 'user', sid: 'sid-1' }, privateKey(), {
      algorithm: 'RS256',
      subject: 'u1',
      expiresIn: '15m',
      keyid: 'some-other-kid',
      header: { alg: 'RS256', typ: 'at+JWT', kid: 'some-other-kid' },
    });
    expect(() => verifyAccessToken(unknownKid)).toThrow();
  });

  it('rejects an elevation token (typ: ep+JWT)', () => {
    expect(() => verifyAccessToken(signTestElevationToken())).toThrow();
  });

  it('rejects an unlock token (typ: ul+JWT)', () => {
    expect(() => verifyAccessToken(signTestUnlockToken())).toThrow();
  });

  it("rejects a plain JWT (jsonwebtoken's default header typ: 'JWT')", () => {
    const plain = jwt.sign({ role: 'user', sid: 'sid-1' }, privateKey(), {
      algorithm: 'RS256',
      subject: 'u1',
      expiresIn: '15m',
      keyid: process.env.JWT_KEY_ID,
    });
    expect(jwt.decode(plain, { complete: true })!.header.typ).toBe('JWT');
    expect(() => verifyAccessToken(plain)).toThrow();
  });
});

describe('signElevationToken', () => {
  it('produces an RS256 token (header typ: ep+JWT) with claims { sub, role, sid } and the configured expiry', () => {
    const token = signElevationToken({ userId: 'abc', role: 'admin', sid: 'sid-1' });
    const decoded = jwt.decode(token, { complete: true })!;
    const payload = decoded.payload as jwt.JwtPayload;

    expect(decoded.header.alg).toBe('RS256');
    expect(decoded.header.typ).toBe('ep+JWT');
    expect(payload.sub).toBe('abc');
    expect(payload.role).toBe('admin');
    expect(payload.sid).toBe('sid-1');
    expect(payload.exp! - payload.iat!).toBe(15 * 60);
    expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'role', 'sid', 'sub']);
  });
});

describe('verifyElevationToken', () => {
  it('returns { user_id, role, sid } from a valid token', () => {
    expect(
      verifyElevationToken(signTestElevationToken({ sub: 'u1', role: 'admin', sid: 'sid-9' })),
    ).toEqual({ user_id: 'u1', role: 'admin', sid: 'sid-9' });
  });

  it('rejects an access token (typ: at+JWT)', () => {
    expect(() => verifyElevationToken(signToken())).toThrow();
  });

  it('rejects an unlock token (typ: ul+JWT)', () => {
    expect(() => verifyElevationToken(signTestUnlockToken())).toThrow();
  });

  it("rejects a plain JWT (jsonwebtoken's default header typ: 'JWT')", () => {
    const plain = jwt.sign({ role: 'user', sid: 'sid-1' }, privateKey(), {
      algorithm: 'RS256',
      subject: 'u1',
      expiresIn: '15m',
      keyid: process.env.JWT_KEY_ID,
    });
    expect(() => verifyElevationToken(plain)).toThrow();
  });

  it('throws on an expired elevation token', () => {
    const expired = jwt.sign(
      { role: 'admin', sid: 'sid-1', exp: Math.floor(Date.now() / 1000) - 60 },
      privateKey(),
      {
        algorithm: 'RS256',
        subject: 'u1',
        keyid: process.env.JWT_KEY_ID,
        header: { alg: 'RS256', typ: 'ep+JWT' },
      },
    );
    expect(() => verifyElevationToken(expired)).toThrow();
  });
});

describe('signUnlockToken', () => {
  it('produces an RS256 token (header typ: ul+JWT) with claims { sub, iat, exp, lck } and a 1 hour expiry', () => {
    const lockedUntil = new Date(Date.now() + 60 * 60 * 1000);
    const token = signUnlockToken({ userId: 'abc', lockedUntil });
    const decoded = jwt.decode(token, { complete: true })!;
    const payload = decoded.payload as jwt.JwtPayload;

    expect(decoded.header.alg).toBe('RS256');
    expect(decoded.header.typ).toBe('ul+JWT');
    expect(payload.sub).toBe('abc');
    expect(payload.lck).toBe(Math.floor(lockedUntil.getTime() / 1000));
    expect(payload.exp! - payload.iat!).toBe(60 * 60);
    expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'lck', 'sub']);
  });

  it('is verifiable with the public key', () => {
    const token = signUnlockToken({ userId: 'abc', lockedUntil: new Date(Date.now() + 3600_000) });
    expect(() => jwt.verify(token, publicKey(), { algorithms: ['RS256'] })).not.toThrow();
  });
});

describe('verifyUnlockToken', () => {
  it('returns { user_id, lck } from a valid token', () => {
    expect(verifyUnlockToken(signTestUnlockToken({ sub: 'u1', lck: 1234567890 }))).toEqual({
      user_id: 'u1',
      lck: 1234567890,
    });
  });

  it('rejects an access token (typ: at+JWT)', () => {
    expect(() => verifyUnlockToken(signToken())).toThrow();
  });

  it('rejects an elevation token (typ: ep+JWT)', () => {
    expect(() => verifyUnlockToken(signTestElevationToken())).toThrow();
  });

  it("rejects a plain JWT (jsonwebtoken's default header typ: 'JWT')", () => {
    const plain = jwt.sign({ lck: 123 }, privateKey(), {
      algorithm: 'RS256',
      subject: 'u1',
      expiresIn: '1h',
      keyid: process.env.JWT_KEY_ID,
    });
    expect(jwt.decode(plain, { complete: true })!.header.typ).toBe('JWT');
    expect(() => verifyUnlockToken(plain)).toThrow();
  });

  it('throws on an expired unlock token', () => {
    const expired = jwt.sign(
      { lck: 123, exp: Math.floor(Date.now() / 1000) - 60 },
      privateKey(),
      {
        algorithm: 'RS256',
        subject: 'u1',
        keyid: process.env.JWT_KEY_ID,
        header: { alg: 'RS256', typ: 'ul+JWT' },
      },
    );
    expect(() => verifyUnlockToken(expired)).toThrow();
  });

  it('throws on a tampered signature', () => {
    expect(() => verifyUnlockToken(tamperSignature(signTestUnlockToken()))).toThrow();
  });

  it('throws on a token signed by a different key pair', () => {
    expect(() => verifyUnlockToken(signWithOtherKey())).toThrow();
  });
});

describe('getJwks', () => {
  it('returns exactly one key when JWT_PREVIOUS_KEY_ID / JWT_PREVIOUS_PUBLIC_KEY_PATH are unset', () => {
    // .env.test does not set either, so this is the normal, no-rotation-in-progress case.
    const { keys } = getJwks();
    expect(keys).toHaveLength(1);
  });

  it('publishes the current key as a standard RSA JWK with use/alg/kid', () => {
    const { keys } = getJwks();
    const [key] = keys as Array<Record<string, unknown>>;
    expect(key).toMatchObject({ kty: 'RSA', use: 'sig', alg: 'RS256' });
    expect(typeof key!.n).toBe('string');
    expect(typeof key!.e).toBe('string');
    expect(key!.kid).toBe(process.env.JWT_KEY_ID);
  });

  it("round-trips: a freshly signed token's kid header matches getJwks()'s key", () => {
    const token = signToken();
    const { header } = jwt.decode(token, { complete: true })!;
    const { keys } = getJwks();
    expect(keys.map((k) => (k as { kid: string }).kid)).toContain(header.kid);
  });
});
