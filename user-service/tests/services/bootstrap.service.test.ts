// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-26
// 26/09/2026: Stage 7 - tests for bootstrapSuperAdmin (config module mocked in this file only)
// 2026-10-02: tests for bootstrapTestUser
// Author review: Congchen
// 2026-10-22: Added a test asserting bootstrapTestUser creates a pending
//   credit_allocation_outbox row for the new user. No requirements, architecture, schema,
//   or API decisions were made by the AI tool.
// Author review:
import bcrypt from 'bcrypt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Scoped to this file: the rest of the suite uses the real config. The superAdmin block is a
// mutable copy so each test can set its own credentials.
vi.mock('../../src/config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/config.js')>();
  return {
    config: {
      ...actual.config,
      superAdmin: { ...actual.config.superAdmin },
      testUser: { ...actual.config.testUser },
    },
  };
});

import { config } from '../../src/config.js';
import * as userQueries from '../../src/db/queries/users.queries.js';
import { bootstrapSuperAdmin, bootstrapTestUser } from '../../src/services/bootstrap.service.js';
import {
  countUsers,
  getCreditAllocationOutboxRows,
  getUserByUsername,
  truncateAll,
} from '../helpers/db.js';

const superAdmin = config.superAdmin as { username: string; email: string; password: string };
const original = { ...superAdmin };
const testUser = config.testUser as { username: string; email: string; password: string };
const testUserOriginal = { ...testUser };

beforeEach(async () => {
  await truncateAll();
  Object.assign(superAdmin, original);
  Object.assign(testUser, testUserOriginal);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await truncateAll();
});

describe('bootstrapSuperAdmin', () => {
  it('creates an active super admin from the configured credentials and logs it', async () => {
    await bootstrapSuperAdmin();

    const row = (await getUserByUsername('superadmin'))!;
    expect(row).toMatchObject({
      role: 'super admin',
      status: 'active',
      email: 'superadmin@foc.test',
    });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('created super admin'));
  });

  it('stores a bcrypt hash of the password, not the password', async () => {
    await bootstrapSuperAdmin();
    const row = (await getUserByUsername('superadmin'))!;
    expect(row.password_hash).not.toBe(superAdmin.password);
    expect(row.password_hash).toMatch(/^\$2[aby]\$10\$/);
    expect(await bcrypt.compare(superAdmin.password, row.password_hash)).toBe(true);
  });

  it('lowercases and trims the configured username and email', async () => {
    superAdmin.username = '  SuperAdmin ';
    superAdmin.email = '  Root@Foc.TEST ';
    await bootstrapSuperAdmin();
    const row = (await userQueries.findSuperAdmin())!;
    expect(row.username).toBe('superadmin');
    expect(row.email).toBe('root@foc.test');
  });

  it('skips silently when a super admin already exists (no duplicate, no log)', async () => {
    await bootstrapSuperAdmin();
    vi.mocked(console.log).mockClear();

    await bootstrapSuperAdmin();

    expect(await countUsers()).toBe(1);
    expect(console.log).not.toHaveBeenCalled();
  });

  it('skips even if the configured credentials changed, when some super admin exists', async () => {
    await bootstrapSuperAdmin();
    superAdmin.username = 'someoneelse';
    superAdmin.email = 'else@foc.test';
    await bootstrapSuperAdmin();
    expect(await countUsers()).toBe(1);
    expect(await getUserByUsername('someoneelse')).toBeUndefined();
  });

  it.each([
    ['too short', 'Ab1!'],
    ['no uppercase', 'weakpass1!'],
    ['no lowercase', 'WEAKPASS1!'],
    ['no digit', 'WeakPass!!'],
    ['no special character', 'WeakPass11'],
  ])('rejects a password that fails the complexity rule (%s), creating nothing', async (_n, pw) => {
    superAdmin.password = pw;
    await expect(bootstrapSuperAdmin()).rejects.toThrow(/SUPER_ADMIN_PASSWORD/);
    expect(await countUsers()).toBe(0);
  });

  it('throws a clear error when the configured username belongs to a regular user', async () => {
    await userQueries.createUser({
      username: 'superadmin',
      email: 'regular@example.com',
      passwordHash: 'h',
      status: 'active',
    });

    await expect(bootstrapSuperAdmin()).rejects.toThrow(
      'SUPER_ADMIN_USERNAME or SUPER_ADMIN_EMAIL is already used by a non-super-admin account.',
    );
    expect(await userQueries.findSuperAdmin()).toBeNull();
    expect(await countUsers()).toBe(1);
  });

  it('throws the same clear error when the configured email belongs to a regular user', async () => {
    await userQueries.createUser({
      username: 'regular',
      email: 'superadmin@foc.test',
      passwordHash: 'h',
      status: 'active',
    });

    await expect(bootstrapSuperAdmin()).rejects.toThrow(
      'SUPER_ADMIN_USERNAME or SUPER_ADMIN_EMAIL is already used by a non-super-admin account.',
    );
    expect(await userQueries.findSuperAdmin()).toBeNull();
  });

  it('two instances starting at once end with exactly one super admin and no error', async () => {
    const results = await Promise.allSettled([bootstrapSuperAdmin(), bootstrapSuperAdmin()]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(await countUsers()).toBe(1);
  });
});

describe('bootstrapTestUser', () => {
  beforeEach(() => {
    Object.assign(testUser, {
      username: ' TestUser ',
      email: 'Test@Foc.test',
      password: 'Test-User-Pass1!',
    });
  });

  it('creates an active regular user with a bcrypt-hashed password', async () => {
    await bootstrapTestUser();
    const row = (await getUserByUsername('testuser'))!;
    expect(row).toMatchObject({ role: 'user', status: 'active', email: 'test@foc.test' });
    expect(await bcrypt.compare('Test-User-Pass1!', row.password_hash)).toBe(true);
  });

  it('creates a pending credit-allocation outbox row for the new user', async () => {
    await bootstrapTestUser();
    const row = (await getUserByUsername('testuser'))!;
    const outboxRows = await getCreditAllocationOutboxRows(row.id);
    expect(outboxRows).toEqual([{ status: 'pending' }]);
  });

  it('does nothing when any TEST_USER_* value is unset', async () => {
    testUser.password = '';
    await bootstrapTestUser();
    expect(await countUsers()).toBe(0);
  });

  it('skips without changing anything when the username already exists', async () => {
    await userQueries.createUser({
      username: 'testuser',
      email: 'other@foc.test',
      passwordHash: 'h',
      status: 'active',
    });
    await bootstrapTestUser();
    expect(await countUsers()).toBe(1);
    expect((await getUserByUsername('testuser'))!.password_hash).toBe('h');
  });

  it('rejects a password that fails the complexity rule, creating nothing', async () => {
    testUser.password = 'weak';
    await expect(bootstrapTestUser()).rejects.toThrow(/TEST_USER_PASSWORD/);
    expect(await countUsers()).toBe(0);
  });
});
