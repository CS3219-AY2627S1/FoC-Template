/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: Generated the local-dev setup script for Stage 17 (instructions.md): creates `.env`
 *        from `.env.example`, generates SUPER_ADMIN_PASSWORD and the RS256 keypair on first
 *        run (or with --force), per the stage's design-decision table. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { generateKeyPairSync, randomInt } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PASSWORD_REGEX } from '../utils/passwordPolicy.js';

const PASSWORD_LENGTH = 24;
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
// Excludes #, $, quotes, backslash and whitespace: they break .env parsing or Compose
// interpolation.
const SPECIAL = '!@%^*-_+.~';
const ALL_CHARS = LOWER + UPPER + DIGITS + SPECIAL;

function randomChar(set: string): string {
  return set[randomInt(set.length)]!;
}

export function generatePassword(): string {
  const chars = [randomChar(LOWER), randomChar(UPPER), randomChar(DIGITS), randomChar(SPECIAL)];
  while (chars.length < PASSWORD_LENGTH) {
    chars.push(randomChar(ALL_CHARS));
  }

  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }

  const password = chars.join('');
  if (!PASSWORD_REGEX.test(password)) {
    throw new Error('Generated password failed PASSWORD_REGEX validation');
  }
  return password;
}

function currentUtcTimestamp(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function readEnvVar(envPath: string, key: string): string | undefined {
  const content = readFileSync(envPath, 'utf8');
  const match = content.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match?.[1];
}

// Replaces the matching `KEY=...` line, preserving every other line and comment. Appends the
// line if it is missing (a stale .env predating this key).
function upsertEnvVar(envPath: string, key: string, value: string): void {
  const content = readFileSync(envPath, 'utf8');
  const lines = content.split('\n');
  const pattern = new RegExp(`^${key}=.*$`);
  let found = false;

  const updated = lines.map((line) => {
    if (pattern.test(line)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!found) {
    updated.push(`${key}=${value}`);
  }

  writeFileSync(envPath, updated.join('\n'));
}

function generateKeys(keysDir: string): void {
  mkdirSync(keysDir, { recursive: true });

  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  const privatePath = join(keysDir, 'private.pem');
  const publicPath = join(keysDir, 'public.pem');

  writeFileSync(privatePath, privateKey);
  chmodSync(privatePath, 0o600);
  writeFileSync(publicPath, publicKey);
}

export interface SetupSummary {
  envCreated: boolean;
  passwordGenerated: boolean;
  password?: string;
  keysGenerated: boolean;
  jwtKeyId?: string;
}

export function runSetup(targetDir: string, options: { force: boolean }): SetupSummary {
  const envPath = join(targetDir, '.env');
  const envExamplePath = join(targetDir, '.env.example');
  const keysDir = join(targetDir, 'keys');

  let envCreated = false;
  if (!existsSync(envPath)) {
    copyFileSync(envExamplePath, envPath);
    envCreated = true;
  }

  let passwordGenerated = false;
  let password: string | undefined;
  const currentPassword = readEnvVar(envPath, 'SUPER_ADMIN_PASSWORD');
  if (!currentPassword || currentPassword.trim() === '') {
    password = generatePassword();
    upsertEnvVar(envPath, 'SUPER_ADMIN_PASSWORD', password);
    passwordGenerated = true;
  }

  const keysExist =
    existsSync(join(keysDir, 'private.pem')) && existsSync(join(keysDir, 'public.pem'));
  let keysGenerated = false;
  let jwtKeyId: string | undefined;
  if (!keysExist || options.force) {
    generateKeys(keysDir);
    keysGenerated = true;
    jwtKeyId = currentUtcTimestamp();
    upsertEnvVar(envPath, 'JWT_KEY_ID', jwtKeyId);
  }

  return { envCreated, passwordGenerated, password, keysGenerated, jwtKeyId };
}

function printUsage(): void {
  console.error('Usage:');
  console.error('  npm run setup');
  console.error('  npm run setup -- --force');
}

// Returns null (and prints usage) for anything other than no args or exactly --force.
export function parseArgs(argv: string[]): { force: boolean } | null {
  if (argv.length === 0) return { force: false };
  if (argv.length === 1 && argv[0] === '--force') return { force: true };
  printUsage();
  return null;
}

function printSummary(summary: SetupSummary, force: boolean): void {
  console.log(`.env: ${summary.envCreated ? 'created from .env.example' : 'already existed'}`);

  if (summary.passwordGenerated) {
    console.log(`SUPER_ADMIN_PASSWORD: generated -> ${summary.password}`);
  } else {
    console.log('SUPER_ADMIN_PASSWORD: already set');
  }

  if (summary.keysGenerated) {
    console.log(`Keys: generated (JWT_KEY_ID=${summary.jwtKeyId})`);
  } else {
    console.log('Keys: already exist, skipped (pass --force to regenerate)');
  }

  if (force) {
    console.log(
      'Tokens signed with the old key are no longer valid. Restart other running services ' +
        '(credit, supplier) so they pick up the new key.',
    );
  }
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed) {
    process.exitCode = 1;
    return;
  }

  const targetDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const summary = runSetup(targetDir, { force: parsed.force });
  printSummary(summary, parsed.force);
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
