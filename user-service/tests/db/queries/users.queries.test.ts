// Scope (2026-11-10, Codex, model: GPT-6): Updated safe user column assertions for preferred language.
// No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review: Congchen
// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-26
// 26/09/2026: Stage 7 - integration tests for users.queries.ts against the real test DB
// Author review:
// 27/09/2026: Stage 9 - tests for listAllUsers and updateUserStatus
// Author review:
// 27/09/2026: Stage 10 - tests for updateUserRole
// Author review:
// 2026-10-22: Stage 15c - adapted the listAllUsers tests to listUsersPage, which replaced
//   it in Stage 15b. Fixture/signature update, not new test cases.
// Author review:
// 2026-11-04: Stage 20 - added tests for findByIdWithNow (Stage 20's unmask-email actor
//   lookup). Governing decision: instructions.md Stage 20.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-10: Fix F4 (Tool: Claude Code, model: claude-fable-5-1) - updatePasswordHash's test reads
//   the hash via findPasswordHashById (findById no longer selects it); added tests that findById,
//   resetLoginLock's RETURNING row, listUsersPage's rows and SAFE_USER_COLUMNS carry no
//   password_hash (listUsersPage's test previously asserted the opposite). Governing
//   decision: the team's F4 fix note (chat, 2026-11-10).
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import pool from '../../../src/db/pool.js';
import { withTransaction } from '../../../src/db/transaction.js';
import * as users from '../../../src/db/queries/users.queries.js';
import { countUsers, expireOtps, getOtps, truncateAll } from '../../helpers/db.js';

beforeEach(truncateAll);
afterEach(truncateAll);

const base = { username: 'alice', email: 'alice@example.com', passwordHash: 'hash' };

async function insertOtp(userId: string, minutesFromNow: number): Promise<void> {
  await pool.query(
    `INSERT INTO users_otps (user_id, otp_hash, purpose, expires_at)
     VALUES ($1, repeat('a', 64), 'Registration', NOW() + make_interval(mins => $2))`,
    [userId, minutesFromNow],
  );
}

describe('createUser', () => {
  it.each(['pending', 'active'] as const)(
    'inserts a user with status %s and role user',
    async (status) => {
      const row = await users.createUser({ ...base, status });
      expect(row).toMatchObject({
        username: 'alice',
        email: 'alice@example.com',
        status,
        role: 'user',
      });
      expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    },
  );

  it('raises a unique violation naming the username constraint', async () => {
    await users.createUser({ ...base, status: 'active' });
    await expect(
      users.createUser({ ...base, email: 'other@example.com', status: 'active' }),
    ).rejects.toMatchObject({ code: '23505', constraint: expect.stringContaining('username') });
  });

  it('raises a unique violation naming the email constraint', async () => {
    await users.createUser({ ...base, status: 'active' });
    await expect(
      users.createUser({ ...base, username: 'bob', status: 'active' }),
    ).rejects.toMatchObject({ code: '23505', constraint: expect.stringContaining('email') });
  });

  it('can run inside a transaction and is undone by a rollback', async () => {
    await expect(
      withTransaction(async (client) => {
        await users.createUser({ ...base, status: 'active' }, client);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await countUsers()).toBe(0);
  });
});

describe('findByUsername / findByEmail / findById', () => {
  it('return the full row (including password_hash) or null', async () => {
    const created = await users.createUser({ ...base, status: 'active' });
    expect((await users.findByUsername('alice'))?.password_hash).toBe('hash');
    expect((await users.findByEmail('alice@example.com'))?.id).toBe(created.id);
    expect((await users.findById(created.id))?.username).toBe('alice');

    expect(await users.findByUsername('nobody')).toBeNull();
    expect(await users.findByEmail('nobody@example.com')).toBeNull();
    expect(await users.findById('00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});

describe('findByIdWithNow', () => {
  it('returns the full row plus the database clock, or null for an unknown id', async () => {
    const created = await users.createUser({ ...base, status: 'active' });
    const before = Date.now();
    const row = await users.findByIdWithNow(created.id);
    const after = Date.now();

    expect(row?.username).toBe('alice');
    expect(row?.db_now.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(row?.db_now.getTime()).toBeLessThanOrEqual(after + 1000);

    expect(await users.findByIdWithNow('00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});

describe('lockUserById', () => {
  it('returns the row, or null for an unknown id', async () => {
    const created = await users.createUser({ ...base, status: 'active' });
    const locked = await withTransaction((client) => users.lockUserById(created.id, client));
    expect(locked?.id).toBe(created.id);
    expect(
      await withTransaction((client) =>
        users.lockUserById('00000000-0000-0000-0000-000000000000', client),
      ),
    ).toBeNull();
  });

  it('blocks a second locker until the first transaction ends', async () => {
    const created = await users.createUser({ ...base, status: 'active' });
    const order: string[] = [];

    await withTransaction(async (client) => {
      await users.lockUserById(created.id, client);
      const second = withTransaction(async (c2) => {
        await users.lockUserById(created.id, c2);
        order.push('second acquired');
      });
      await new Promise((r) => setTimeout(r, 200));
      order.push('first releasing');
      // `second` cannot finish before this transaction commits.
      expect(order).toEqual(['first releasing']);
      void second;
    });
    await new Promise((r) => setTimeout(r, 200));
    expect(order).toEqual(['first releasing', 'second acquired']);
  });
});

describe('activateUser', () => {
  it('activates a pending user and reports true', async () => {
    const u = await users.createUser({ ...base, status: 'pending' });
    expect(await users.activateUser(u.id)).toBe(true);
    expect((await users.findById(u.id))?.status).toBe('active');
  });

  it('reports false, and changes nothing, when the user is not pending', async () => {
    const active = await users.createUser({ ...base, status: 'active' });
    expect(await users.activateUser(active.id)).toBe(false);

    await pool.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [active.id]);
    expect(await users.activateUser(active.id)).toBe(false);
    expect((await users.findById(active.id))?.status).toBe('suspended');
  });

  it('only succeeds once for the same pending user', async () => {
    const u = await users.createUser({ ...base, status: 'pending' });
    expect(await users.activateUser(u.id)).toBe(true);
    expect(await users.activateUser(u.id)).toBe(false);
  });

  it('reports false for an unknown id', async () => {
    expect(await users.activateUser('00000000-0000-0000-0000-000000000000')).toBe(false);
  });
});

describe('deleteStalePendingUsers', () => {
  const target = { username: 'alice', email: 'alice@example.com' };

  it('deletes a pending user whose OTPs have all expired, cascading the OTP rows', async () => {
    const u = await users.createUser({ ...base, status: 'pending' });
    await insertOtp(u.id, 10);
    await expireOtps(u.id);

    await users.deleteStalePendingUsers(target);

    expect(await users.findById(u.id)).toBeNull();
    expect(await getOtps(u.id)).toHaveLength(0);
  });

  it('matches on either username or email', async () => {
    const byName = await users.createUser({ ...base, status: 'pending' });
    await insertOtp(byName.id, -5);
    await users.deleteStalePendingUsers({ username: 'alice', email: 'other@example.com' });
    expect(await users.findById(byName.id)).toBeNull();

    const byEmail = await users.createUser({ ...base, status: 'pending' });
    await insertOtp(byEmail.id, -5);
    await users.deleteStalePendingUsers({ username: 'other', email: 'alice@example.com' });
    expect(await users.findById(byEmail.id)).toBeNull();
  });

  it('keeps a pending user that still has a live (unexpired) OTP', async () => {
    const u = await users.createUser({ ...base, status: 'pending' });
    await insertOtp(u.id, 10);
    await users.deleteStalePendingUsers(target);
    expect(await users.findById(u.id)).not.toBeNull();
  });

  it('keeps a pending user if any one of its OTPs is still live', async () => {
    const u = await users.createUser({ ...base, status: 'pending' });
    await insertOtp(u.id, -5);
    await insertOtp(u.id, 10);
    await users.deleteStalePendingUsers(target);
    expect(await users.findById(u.id)).not.toBeNull();
  });

  it('never deletes active or suspended users', async () => {
    const u = await users.createUser({ ...base, status: 'active' });
    await users.deleteStalePendingUsers(target);
    expect(await users.findById(u.id)).not.toBeNull();

    await pool.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [u.id]);
    await users.deleteStalePendingUsers(target);
    expect(await users.findById(u.id)).not.toBeNull();
  });

  it('leaves unrelated pending users alone', async () => {
    const other = await users.createUser({
      username: 'bob',
      email: 'bob@example.com',
      passwordHash: 'h',
      status: 'pending',
    });
    await insertOtp(other.id, -5);
    await users.deleteStalePendingUsers(target);
    expect(await users.findById(other.id)).not.toBeNull();
  });

  it('skips (does not wait for, and does not delete) a row locked by another transaction', async () => {
    const u = await users.createUser({ ...base, status: 'pending' });
    await insertOtp(u.id, -5);

    await withTransaction(async (holder) => {
      await users.lockUserById(u.id, holder);

      const started = Date.now();
      await users.deleteStalePendingUsers(target); // pool connection, different transaction
      expect(Date.now() - started).toBeLessThan(2000);
    });

    // The locked row survived the delete.
    expect(await users.findById(u.id)).not.toBeNull();
  });
});

describe('findSuperAdmin / createSuperAdmin', () => {
  const admin = { username: 'root', email: 'root@example.com', passwordHash: 'h' };

  it('findSuperAdmin returns null when there is none', async () => {
    expect(await users.findSuperAdmin()).toBeNull();
  });

  it('createSuperAdmin inserts an active super admin and returns the row', async () => {
    const row = await users.createSuperAdmin(admin);
    expect(row).toMatchObject({ role: 'super admin', status: 'active', username: 'root' });
    expect((await users.findSuperAdmin())?.id).toBe(row!.id);
  });

  it('createSuperAdmin returns null (no error) on a username or email conflict', async () => {
    await users.createUser({
      username: 'root',
      email: 'someone@example.com',
      passwordHash: 'h',
      status: 'active',
    });
    expect(await users.createSuperAdmin(admin)).toBeNull();
    expect(
      await users.createSuperAdmin({ ...admin, username: 'other', email: 'someone@example.com' }),
    ).toBeNull();
    expect(await countUsers()).toBe(1);
  });
});

describe('updatePasswordHash', () => {
  it('replaces the hash and bumps updated_at', async () => {
    const u = await users.createUser({ ...base, status: 'active' });
    await new Promise((r) => setTimeout(r, 20));
    await users.updatePasswordHash(u.id, 'new-hash');
    const after = (await users.findById(u.id))!;
    expect((await users.findPasswordHashById(u.id))!.password_hash).toBe('new-hash');
    expect(after.updated_at.getTime()).toBeGreaterThan(u.updated_at.getTime());
  });
});

describe('safe user columns (fix F4)', () => {
  it('SAFE_USER_COLUMNS never names password_hash', () => {
    expect(users.SAFE_USER_COLUMNS).not.toContain('password_hash');
    expect(users.SAFE_USER_COLUMNS).toContain('AS is_locked');
  });

  it('findById returns every non-secret column plus is_locked, and no password_hash', async () => {
    const u = await users.createUser({ ...base, status: 'active' });
    const row = (await users.findById(u.id))!;
    expect(Object.keys(row).sort()).toEqual(
      [
        'id', 'username', 'email', 'created_at', 'updated_at', 'status', 'role', 'active_view', 'preferred_lang',
        'login_failed_attempts', 'login_failure_window_start', 'login_locked_until',
        'login_lock_level', 'is_locked',
      ].sort(),
    );
    expect(row).not.toHaveProperty('password_hash');
    expect(await users.findPasswordHashById(u.id)).toEqual({ password_hash: 'hash' });
    expect(await users.findPasswordHashById('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('resetLoginLock returns the cleared row without password_hash, or null for an unknown id', async () => {
    const u = await users.createUser({ ...base, status: 'active' });
    await users.lockLoginAccount(u.id, { lockedUntil: new Date(Date.now() + 60_000), lockLevel: 2 });
    const cleared = (await users.resetLoginLock(u.id))!;
    expect(cleared).toMatchObject({
      id: u.id,
      login_failed_attempts: 0,
      login_failure_window_start: null,
      login_locked_until: null,
      login_lock_level: 0,
      is_locked: false,
    });
    expect(cleared).not.toHaveProperty('password_hash');
    expect(await users.resetLoginLock('00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});

describe('listUsersPage', () => {
  const defaultPage = { sortBy: 'createdAt' as const, sortDir: 'desc' as const, limit: 50, offset: 0 };

  it('returns users of every status, newest first, without password_hash (fix F4), and the total', async () => {
    const a = await users.createUser({ ...base, status: 'active' });
    const b = await users.createUser({
      username: 'bob',
      email: 'bob@example.com',
      passwordHash: 'hash',
      status: 'pending',
    });
    const c = await users.createUser({
      username: 'carol',
      email: 'carol@example.com',
      passwordHash: 'hash',
      status: 'active',
    });
    await users.updateUserStatus(c.id, 'suspended');

    const { rows, total } = await users.listUsersPage(defaultPage);
    expect(rows.map((r) => r.status).sort()).toEqual(['active', 'pending', 'suspended']);
    expect(rows.map((r) => r.id)).toEqual([c.id, b.id, a.id]);
    for (const r of rows) expect(r).not.toHaveProperty('password_hash');
    expect(total).toBe(3);
  });

  it('returns an empty array and a zero total when there are no users', async () => {
    const { rows, total } = await users.listUsersPage(defaultPage);
    expect(rows).toEqual([]);
    expect(total).toBe(0);
  });
});

describe('updateUserStatus', () => {
  it('sets the status, bumps updated_at and returns the updated row', async () => {
    const u = await users.createUser({ ...base, status: 'active' });
    const updated = await users.updateUserStatus(u.id, 'suspended');
    expect(updated.id).toBe(u.id);
    expect(updated.status).toBe('suspended');
    expect(updated.updated_at.getTime()).toBeGreaterThanOrEqual(u.updated_at.getTime());
    expect((await users.findById(u.id))!.status).toBe('suspended');
  });

  it('can flip a suspended user back to active', async () => {
    const u = await users.createUser({ ...base, status: 'active' });
    await users.updateUserStatus(u.id, 'suspended');
    expect((await users.updateUserStatus(u.id, 'active')).status).toBe('active');
  });

  it('runs on the transaction client and rolls back with it', async () => {
    const u = await users.createUser({ ...base, status: 'active' });
    await expect(
      withTransaction(async (client) => {
        await users.updateUserStatus(u.id, 'suspended', client);
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');
    expect((await users.findById(u.id))!.status).toBe('active');
  });
});

describe('updateUserRole', () => {
  it('sets the role, bumps updated_at and returns the updated row', async () => {
    const u = await users.createUser({ ...base, status: 'active' });
    const updated = await users.updateUserRole(u.id, 'admin');
    expect(updated.id).toBe(u.id);
    expect(updated.role).toBe('admin');
    expect(updated.updated_at.getTime()).toBeGreaterThanOrEqual(u.updated_at.getTime());
    expect((await users.findById(u.id))!.role).toBe('admin');
  });

  it('can demote an admin back to user', async () => {
    const u = await users.createUser({ ...base, status: 'active' });
    await users.updateUserRole(u.id, 'admin');
    expect((await users.updateUserRole(u.id, 'user')).role).toBe('user');
  });

  it('runs on the transaction client and rolls back with it', async () => {
    const u = await users.createUser({ ...base, status: 'active' });
    await expect(
      withTransaction(async (client) => {
        await users.updateUserRole(u.id, 'admin', client);
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');
    expect((await users.findById(u.id))!.role).toBe('user');
  });
});
