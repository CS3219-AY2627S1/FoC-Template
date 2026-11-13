/*
globalSetup runs in its own process, so the container URI has to be re-published
into each worker's env. This file runs before any test module is imported, which
matters because src/database/db.ts builds its Pool at import time, and
src/middleware/jwt-validation.ts reads USER_SERVICE_PUBLIC_KEY_PATH on the first authenticated request.
*/

import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inject } from 'vitest';

process.env.DATABASE_URL = inject('databaseUrl');

/*
The user service owns the real signing key, so tests mint their own throwaway
pair: the public half is written where authenticate reads it, and the private
half is used by tests/helpers/auth-token.ts to sign test tokens.
Generating it here rather than committing a fixture keeps a usable signing key
out of the repository.
*/
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const publicKeyPath = path.join(tmpdir(), 'foc-supplier-test-jwt-public.pem');
writeFileSync(publicKeyPath, publicKey);

process.env.USER_SERVICE_PUBLIC_KEY_PATH = publicKeyPath;
process.env.TEST_JWT_PRIVATE_KEY = privateKey;
