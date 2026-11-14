// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-26
// 26/09/2026: Stage 7 - config.ts validation, run as a child process with a modified env
// Author review:
// 2026-11-05: Stage 23a - test cases for the REFRESH_TOKEN_TTL_DAYS (1-30) and
//   ACCESS_TOKEN_TTL_MINUTES (1-15) bounds. Bounds are the governing decision already recorded
//   in instructions.md Stage 23a.
// Author review:
// 2026-11-09: Stage 27a - test cases for the new ELEVATION_TOKEN_TTL_MINUTES (1-15) bounds.
//   Governing decision: instructions.md Stage 27. No requirements, architecture, schema, or
//   API decisions were made by the AI tool.
// Author review:
// 2026-11-09: Stage 28b - added USER_ORDER_SERVICE_API_KEY to the missing-required-variables
//   list. Governing decision: instructions.md Stage 28b. No requirements, architecture,
//   schema, or API decisions were made by the AI tool.
// Author review:
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tsx = resolve(root, 'node_modules/.bin/tsx');

// Loads src/config.ts in a fresh process. Values in `overrides` replace the inherited env;
// a value of undefined removes the variable.
function loadConfig(overrides: Record<string, string | undefined>) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  const result = spawnSync(
    tsx,
    ['-e', "import('./src/config.ts').then((m) => console.log(JSON.stringify(m.config.otp)))"],
    { cwd: root, env, encoding: 'utf8' },
  );
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('config.ts', () => {
  it('loads with the test environment and exposes config.otp.resendWindowMinutes', () => {
    const r = loadConfig({});
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout.trim())).toEqual({
      ttlMinutes: 10,
      resendCooldownSeconds: 60,
      maxResends: 5,
      resendWindowMinutes: 60,
    });
  });

  describe('missing required variables', () => {
    it.each([
      'DB_HOST',
      'DB_NAME',
      'JWT_PRIVATE_KEY_PATH',
      'SUPER_ADMIN_USERNAME',
      'OTP_TTL_MINUTES',
      'OTP_RESEND_WINDOW_MINUTES',
      'USER_ORDER_SERVICE_API_KEY',
    ])('exits non-zero and names %s when it is missing', (name) => {
      const r = loadConfig({ [name]: undefined });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('Invalid or missing environment variables');
      expect(r.stderr).toContain(name);
    });

    it('rejects an empty SUPER_ADMIN_PASSWORD', () => {
      const r = loadConfig({ SUPER_ADMIN_PASSWORD: '' });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('SUPER_ADMIN_PASSWORD');
    });

    it('rejects a non-positive or non-integer OTP number', () => {
      expect(loadConfig({ OTP_MAX_RESENDS: '0' }).status).toBe(1);
      expect(loadConfig({ OTP_TTL_MINUTES: '1.5' }).status).toBe(1);
      expect(loadConfig({ OTP_RESEND_WINDOW_MINUTES: 'abc' }).status).toBe(1);
    });

    it('rejects an unknown NODE_ENV', () => {
      expect(loadConfig({ NODE_ENV: 'staging' }).status).toBe(1);
    });
  });

  describe('TTL env var bounds', () => {
    it.each([
      ['REFRESH_TOKEN_TTL_DAYS', '0'],
      ['REFRESH_TOKEN_TTL_DAYS', '31'],
      ['ACCESS_TOKEN_TTL_MINUTES', '0'],
      ['ACCESS_TOKEN_TTL_MINUTES', '16'],
      ['ELEVATION_TOKEN_TTL_MINUTES', '0'],
      ['ELEVATION_TOKEN_TTL_MINUTES', '16'],
    ])('rejects %s=%s with an error naming the variable', (name, value) => {
      const r = loadConfig({ [name]: value });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('Invalid or missing environment variables');
      expect(r.stderr).toContain(name);
    });

    it.each([
      ['REFRESH_TOKEN_TTL_DAYS', '1'],
      ['REFRESH_TOKEN_TTL_DAYS', '30'],
      ['ACCESS_TOKEN_TTL_MINUTES', '1'],
      ['ACCESS_TOKEN_TTL_MINUTES', '15'],
      ['ELEVATION_TOKEN_TTL_MINUTES', '1'],
      ['ELEVATION_TOKEN_TTL_MINUTES', '15'],
    ])('accepts %s=%s', (name, value) => {
      expect(loadConfig({ [name]: value }).status).toBe(0);
    });

    it('still rejects a non-integer value within range', () => {
      expect(loadConfig({ REFRESH_TOKEN_TTL_DAYS: '1.5' }).status).toBe(1);
      expect(loadConfig({ ACCESS_TOKEN_TTL_MINUTES: '1.5' }).status).toBe(1);
      expect(loadConfig({ ELEVATION_TOKEN_TTL_MINUTES: '1.5' }).status).toBe(1);
    });

    it('accepts the existing .env.test values', () => {
      expect(loadConfig({}).status).toBe(0);
    });
  });

  describe('SMTP variables', () => {
    const emptySmtp = { SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '', SMTP_FROM: '' };

    it('may be empty when NODE_ENV=development', () => {
      expect(loadConfig({ NODE_ENV: 'development', ...emptySmtp }).status).toBe(0);
    });

    it('may be missing entirely when NODE_ENV=development', () => {
      expect(
        loadConfig({
          NODE_ENV: 'development',
          SMTP_HOST: undefined,
          SMTP_USER: undefined,
          SMTP_PASS: undefined,
          SMTP_FROM: undefined,
        }).status,
      ).toBe(0);
    });

    it('exit with an error naming each empty variable when NODE_ENV=production', () => {
      const r = loadConfig({ NODE_ENV: 'production', ...emptySmtp });
      expect(r.status).toBe(1);
      for (const name of Object.keys(emptySmtp)) expect(r.stderr).toContain(name);
    });

    it('are also required when NODE_ENV=test', () => {
      const r = loadConfig({ NODE_ENV: 'test', SMTP_HOST: '' });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('SMTP_HOST');
    });

    it('load fine in production when all are set', () => {
      expect(loadConfig({ NODE_ENV: 'production' }).status).toBe(0);
    });
  });
});
