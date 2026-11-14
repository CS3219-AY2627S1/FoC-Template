// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-11-04
// 2026-11-04: Stage 17 - tests for the local-dev setup script's non-Docker Verification
//   bullets, run against a temp directory per the stage's own testability requirement. No
//   requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generatePassword, parseArgs, runSetup } from '../../src/scripts/setupLocalDev.js';
import { PASSWORD_REGEX } from '../../src/utils/passwordPolicy.js';

const UTC_TIMESTAMP_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const ALLOWED_CHARS_REGEX = /^[A-Za-z0-9!@%^*\-_+.~]{24}$/;

const ENV_EXAMPLE = [
  'PORT=3001',
  '',
  '# Super Admin Bootstrap',
  'SUPER_ADMIN_USERNAME=superadmin',
  'SUPER_ADMIN_PASSWORD=',
  '',
  'JWT_KEY_ID=2026-10',
].join('\n');

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'setup-local-dev-'));
  writeFileSync(join(dir, '.env.example'), ENV_EXAMPLE);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function envContent(): string {
  return readFileSync(join(dir, '.env'), 'utf8');
}

describe('runSetup', () => {
  it('on a fresh directory: creates .env, generates a password, generates both keys', () => {
    const summary = runSetup(dir, { force: false });

    expect(summary.envCreated).toBe(true);
    expect(summary.passwordGenerated).toBe(true);
    expect(summary.password).toBeDefined();
    expect(PASSWORD_REGEX.test(summary.password!)).toBe(true);
    expect(summary.keysGenerated).toBe(true);
    expect(summary.jwtKeyId).toMatch(UTC_TIMESTAMP_REGEX);

    expect(existsSync(join(dir, '.env'))).toBe(true);
    expect(envContent()).toContain(`SUPER_ADMIN_PASSWORD=${summary.password}`);
    expect(envContent()).toContain(`JWT_KEY_ID=${summary.jwtKeyId}`);

    expect(existsSync(join(dir, 'keys', 'private.pem'))).toBe(true);
    expect(existsSync(join(dir, 'keys', 'public.pem'))).toBe(true);
    const privateMode = statSync(join(dir, 'keys', 'private.pem')).mode & 0o777;
    expect(privateMode).toBe(0o600);
  });

  it('running again with no flags: leaves the password, keys and JWT_KEY_ID unchanged', () => {
    const first = runSetup(dir, { force: false });
    const envAfterFirst = envContent();
    const privateKeyAfterFirst = readFileSync(join(dir, 'keys', 'private.pem'), 'utf8');

    const second = runSetup(dir, { force: false });

    expect(second.envCreated).toBe(false);
    expect(second.passwordGenerated).toBe(false);
    expect(second.password).toBeUndefined();
    expect(second.keysGenerated).toBe(false);
    expect(second.jwtKeyId).toBeUndefined();

    expect(envContent()).toBe(envAfterFirst);
    expect(readFileSync(join(dir, 'keys', 'private.pem'), 'utf8')).toBe(privateKeyAfterFirst);
    expect(envContent()).toContain(`SUPER_ADMIN_PASSWORD=${first.password}`);
  });

  it('deleting only public.pem: regenerates both keys and updates JWT_KEY_ID', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const first = runSetup(dir, { force: false });
    const oldPrivateKey = readFileSync(join(dir, 'keys', 'private.pem'), 'utf8');

    rmSync(join(dir, 'keys', 'public.pem'));
    vi.setSystemTime(new Date('2026-01-02T00:00:00Z'));
    const second = runSetup(dir, { force: false });
    vi.useRealTimers();

    expect(second.keysGenerated).toBe(true);
    expect(second.jwtKeyId).toMatch(UTC_TIMESTAMP_REGEX);
    expect(second.jwtKeyId).not.toBe(first.jwtKeyId);
    expect(readFileSync(join(dir, 'keys', 'private.pem'), 'utf8')).not.toBe(oldPrivateKey);
    expect(existsSync(join(dir, 'keys', 'public.pem'))).toBe(true);
  });

  it('--force: regenerates keys and JWT_KEY_ID even when both keys already exist, leaves the password unchanged', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const first = runSetup(dir, { force: false });
    const oldPrivateKey = readFileSync(join(dir, 'keys', 'private.pem'), 'utf8');

    vi.setSystemTime(new Date('2026-01-02T00:00:00Z'));
    const second = runSetup(dir, { force: true });
    vi.useRealTimers();

    expect(second.keysGenerated).toBe(true);
    expect(second.jwtKeyId).not.toBe(first.jwtKeyId);
    expect(readFileSync(join(dir, 'keys', 'private.pem'), 'utf8')).not.toBe(oldPrivateKey);
    expect(second.passwordGenerated).toBe(false);
    expect(envContent()).toContain(`SUPER_ADMIN_PASSWORD=${first.password}`);
  });

  it('an existing .env with a blank SUPER_ADMIN_PASSWORD: only that line changes', () => {
    // Keys already present so this run only touches the password line, isolating that bullet
    // from the "keys missing" bullets covered elsewhere in this file.
    mkdirSync(join(dir, 'keys'), { recursive: true });
    writeFileSync(join(dir, 'keys', 'private.pem'), 'dummy-private');
    writeFileSync(join(dir, 'keys', 'public.pem'), 'dummy-public');

    const existingEnv = [
      'PORT=3001',
      '',
      '# Super Admin Bootstrap',
      'SUPER_ADMIN_USERNAME=superadmin',
      'SUPER_ADMIN_PASSWORD=',
      '',
      'JWT_KEY_ID=2026-10',
    ].join('\n');
    writeFileSync(join(dir, '.env'), existingEnv);

    const summary = runSetup(dir, { force: false });

    expect(summary.envCreated).toBe(false);
    expect(summary.passwordGenerated).toBe(true);
    expect(summary.keysGenerated).toBe(false);

    const expectedLines = existingEnv
      .split('\n')
      .map((line) =>
        line === 'SUPER_ADMIN_PASSWORD=' ? `SUPER_ADMIN_PASSWORD=${summary.password}` : line,
      );
    expect(envContent().split('\n')).toEqual(expectedLines);
  });

  it('an existing .env missing the JWT_KEY_ID line entirely: the line is appended when keys are generated', () => {
    const existingEnv = ['PORT=3001', 'SUPER_ADMIN_PASSWORD=AlreadySet1Str0ng!'].join('\n');
    writeFileSync(join(dir, '.env'), existingEnv);

    const summary = runSetup(dir, { force: false });

    expect(summary.passwordGenerated).toBe(false);
    expect(summary.keysGenerated).toBe(true);
    expect(envContent()).toContain('PORT=3001');
    expect(envContent()).toContain('SUPER_ADMIN_PASSWORD=AlreadySet1Str0ng!');
    expect(envContent()).toContain(`JWT_KEY_ID=${summary.jwtKeyId}`);
  });
});

describe('generatePassword', () => {
  it('over 10,000 runs, always produces a 24-char password matching PASSWORD_REGEX and allowed characters', () => {
    for (let i = 0; i < 10_000; i++) {
      const password = generatePassword();
      expect(password).toHaveLength(24);
      expect(PASSWORD_REGEX.test(password)).toBe(true);
      expect(ALLOWED_CHARS_REGEX.test(password)).toBe(true);
    }
  });
});

describe('parseArgs', () => {
  it('accepts no arguments', () => {
    expect(parseArgs([])).toEqual({ force: false });
  });

  it('accepts exactly --force', () => {
    expect(parseArgs(['--force'])).toEqual({ force: true });
  });

  it('rejects an unknown flag and prints usage', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(parseArgs(['--foo'])).toBeNull();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Usage'));
    spy.mockRestore();
  });

  it('rejects more than one argument', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(parseArgs(['--force', 'extra'])).toBeNull();
    spy.mockRestore();
  });
});
