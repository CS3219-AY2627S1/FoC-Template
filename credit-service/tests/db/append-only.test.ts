// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-10-16
//  2026-10-16: Week 7/8 catch-up - evidence for NFR8.2.3. The suite connects as the
//    least-privilege role, so these assert the real production privileges.
//    Requires a running credit-db; see credit-service/README.md.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
//  2026-10-22: Credit transfer consumer - the UPDATE case now asserts the whole row is
//    unchanged, and a new block checks dead_letter_jobs' privileges are scoped to that
//    table so transaction_log did not pick up UPDATE alongside it.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

import { afterAll, describe, expect, it } from 'vitest';
import pool from '../../src/db/pool.js';
import {
  closePool,
  givenReservation,
  newRequestId,
  newUserId,
} from '../helpers/db.js';
import {
  findDeadLettersByJobId,
  insertDeadLetter,
} from '../../src/db/queries/deadLetter.queries.js';

/** 42501 is insufficient_privilege — the error a missing GRANT produces. */
const PG_INSUFFICIENT_PRIVILEGE = '42501';

afterAll(async () => {
  await closePool();
});

/** The whole log row for a request, so a test can assert nothing about it moved. */
async function logRow(requestId: string) {
  const { rows } = await pool.query(
    `SELECT transaction_id, transaction_type, originating_user_id, destination_user_id,
            amount, created_at, request_id
       FROM transaction_log WHERE request_id = $1`,
    [requestId],
  );
  return rows[0];
}

describe('NFR8.2.3 — the transaction log is append-only', () => {
  it('connects as the least-privilege role, not a superuser', async () => {
    const { rows } = await pool.query<{ user: string; superuser: boolean }>(
      `SELECT current_user AS user,
              (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS superuser`,
    );
    // If this fails, every other assertion in this file is meaningless: a superuser
    // bypasses GRANT and REVOKE entirely.
    expect(rows[0]?.user).toBe(process.env.DB_USER);
    expect(rows[0]?.superuser).toBe(false);
  });

  it('refuses DELETE on transaction_log', async () => {
    const { requestId } = await givenReservation(3);

    await expect(
      pool.query('DELETE FROM transaction_log WHERE request_id = $1', [requestId]),
    ).rejects.toMatchObject({ code: PG_INSUFFICIENT_PRIVILEGE });

    // The row is still there.
    const { rows } = await pool.query('SELECT 1 FROM transaction_log WHERE request_id = $1', [
      requestId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('refuses UPDATE on transaction_log', async () => {
    const { requestId } = await givenReservation(3);
    const before = await logRow(requestId);

    await expect(
      pool.query('UPDATE transaction_log SET amount = 999 WHERE request_id = $1', [requestId]),
    ).rejects.toMatchObject({ code: PG_INSUFFICIENT_PRIVILEGE });

    // The whole row is unchanged, not just the amount. Checked column by column
    // because credit_app now holds UPDATE on a neighbouring table (dead_letter_jobs),
    // so "UPDATE is refused here" is a per-table claim that has to keep being true.
    expect(await logRow(requestId)).toEqual(before);
    expect(before?.amount).toBe(3);
  });

  it('refuses TRUNCATE on transaction_log', async () => {
    await expect(pool.query('TRUNCATE transaction_log')).rejects.toMatchObject({
      code: PG_INSUFFICIENT_PRIVILEGE,
    });
  });

  it('refuses DELETE on balances', async () => {
    const { requesterId } = await givenReservation(2);

    await expect(
      pool.query('DELETE FROM balances WHERE user_id = $1', [requesterId]),
    ).rejects.toMatchObject({ code: PG_INSUFFICIENT_PRIVILEGE });
  });

  it('still allows the writes the service actually needs', async () => {
    // SELECT and INSERT on the log, SELECT/INSERT/UPDATE on balances. If any of these
    // were revoked too, the service would be broken rather than merely safe.
    const { requesterId, requestId } = await givenReservation(1);
    const { rows } = await pool.query('SELECT 1 FROM transaction_log WHERE request_id = $1', [
      requestId,
    ]);
    expect(rows).toHaveLength(1);
    await expect(
      pool.query('UPDATE balances SET updated_at = NOW() WHERE user_id = $1', [requesterId]),
    ).resolves.toBeDefined();
  });
});

// --------------------------------------------------------------------------------
// dead_letter_jobs carries UPDATE, which transaction_log must not acquire by accident.
// `GRANT ... ON ALL TABLES IN SCHEMA public` would hand it over silently; these assert
// the grant stayed surgical.
// --------------------------------------------------------------------------------
describe('dead_letter_jobs privileges are scoped to that table', () => {
  async function seedDeadLetter(): Promise<string> {
    const jobId = `outbox-test-${Math.random().toString(36).slice(2)}`;
    await insertDeadLetter(pool, {
      jobId,
      taskName: 'credit_transfer',
      payload: { requestId: newRequestId(), courierId: newUserId() },
      errorTrace: 'seeded by the privilege test',
      failedAt: new Date(),
    });
    return jobId;
  }

  it('lets the worker INSERT without a sequence grant', async () => {
    // id is GENERATED ALWAYS AS IDENTITY. With BIGSERIAL this would fail with
    // `permission denied for sequence dead_letter_jobs_id_seq`.
    const jobId = await seedDeadLetter();
    expect(await findDeadLettersByJobId(pool, jobId)).toHaveLength(1);
  });

  it('defaults status to UNRESOLVED', async () => {
    const jobId = await seedDeadLetter();
    const [row] = await findDeadLettersByJobId(pool, jobId);
    expect(row?.status).toBe('UNRESOLVED');
  });

  it('lets an administrator resolve one by UPDATEing status', async () => {
    const jobId = await seedDeadLetter();
    await expect(
      pool.query(`UPDATE dead_letter_jobs SET status = 'RESOLVED' WHERE job_id = $1`, [jobId]),
    ).resolves.toBeDefined();
    const [row] = await findDeadLettersByJobId(pool, jobId);
    expect(row?.status).toBe('RESOLVED');
  });

  it('refuses DELETE on dead_letter_jobs', async () => {
    const jobId = await seedDeadLetter();
    await expect(
      pool.query('DELETE FROM dead_letter_jobs WHERE job_id = $1', [jobId]),
    ).rejects.toMatchObject({ code: PG_INSUFFICIENT_PRIVILEGE });
    expect(await findDeadLettersByJobId(pool, jobId)).toHaveLength(1);
  });

  it('refuses TRUNCATE on dead_letter_jobs', async () => {
    await expect(pool.query('TRUNCATE dead_letter_jobs')).rejects.toMatchObject({
      code: PG_INSUFFICIENT_PRIVILEGE,
    });
  });

  it('granting UPDATE here did not grant it on transaction_log', async () => {
    // The regression this whole block exists to catch.
    const { rows } = await pool.query<{ table_name: string; privilege_type: string }>(
      `SELECT table_name, privilege_type
         FROM information_schema.table_privileges
        WHERE grantee = current_user
          AND table_name IN ('transaction_log', 'dead_letter_jobs', 'balances')
        ORDER BY table_name, privilege_type`,
    );
    const held = (table: string) =>
      rows.filter((r) => r.table_name === table).map((r) => r.privilege_type).sort();

    expect(held('transaction_log')).toEqual(['INSERT', 'SELECT']);
    expect(held('dead_letter_jobs')).toEqual(['INSERT', 'SELECT', 'UPDATE']);
    expect(held('balances')).toEqual(['INSERT', 'SELECT', 'UPDATE']);
  });
});
