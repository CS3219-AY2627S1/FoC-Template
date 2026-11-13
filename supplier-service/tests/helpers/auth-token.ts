/*
Mints tokens that stand in for the ones the user service issues, signed with the
throwaway key pair created in tests/setup-env.ts.

ALERT: AI assisted programming
*/

import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { ADMINISTRATOR, USER, type Role } from '@/middleware/jwt-validation';

type TokenOptions = {
  id?: string;
  roles?: Role[];
  //seconds; negative values produce an already-expired token
  expiresIn?: number;
};

export function signTestToken({
  id = 'test-user',
  roles = [ADMINISTRATOR],
  expiresIn = 300,
}: TokenOptions = {}): string {
  return jwt.sign({ roles }, process.env.TEST_JWT_PRIVATE_KEY as string, {
    algorithm: 'RS256',
    subject: id,
    expiresIn,
  });
}

export const adminBearer = () => `Bearer ${signTestToken({ id: 'test-admin', roles: [ADMINISTRATOR] })}`;
export const userBearer = () => `Bearer ${signTestToken({ id: 'test-user', roles: [USER] })}`;

/*
Correctly formed and signed, but by a key this service has no reason to trust.
Verification has to fail on the signature rather than on the token's shape.
*/
export function foreignBearer(): string {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  const token = jwt.sign({ roles: [ADMINISTRATOR] }, privateKey, {
    algorithm: 'RS256',
    subject: 'impostor',
    expiresIn: 300,
  });

  return `Bearer ${token}`;
}
