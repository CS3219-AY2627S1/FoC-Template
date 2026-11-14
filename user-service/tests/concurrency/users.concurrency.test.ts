/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Generated Vitest concurrency tests (real test DB) for PUT /users/:id/status, covering
 *        the Stage 9 concurrent-status Verification bullet in instructions.md.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Added the concurrent PUT /users/:id/role test (Stage 10 Verification).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: Both requests now send a reason (required by Stage 26b), and each test asserts
 *        exactly one audit row per actual state transition: rows ordered by created_at form a
 *        consistent before/after chain ending at the final DB status/role, which a no-op
 *        request cannot have added a link to.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Both requests now also send a matching Elevated-Token header, since both routes now
 *        require elevation (Stage 27b). Fixture value, not a new assertion: these tests are
 *        about the concurrent-write race, not elevation itself.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-fable-5-1), date: 2026-11-10
 * Scope: Fix F2 - debugged the ECONNRESET / "socket hang up" flake; replaced per-call
 *        `request(app)` supertest servers with the shared loopback server in
 *        tests/helpers/server.ts (`api()`). No test logic or assertions changed.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api } from '../helpers/server.js';
import { signElevationToken } from '../../src/utils/jwt.js';
import { CONCURRENT_REQUESTS as N, LOOP_ITERATIONS } from '../helpers/constants.js';
import {
  getAuditLogRowsForTarget,
  getRefreshTokens,
  getUserByEmail,
  seedRefreshToken,
  truncateAll,
} from '../helpers/db.js';
import { resetEmailMock } from '../helpers/email.js';
import {
  accessTokenFor,
  bearer,
  createActiveUser,
  createUserWithRole,
} from '../helpers/fixtures.js';

resetEmailMock();
beforeEach(truncateAll);
afterEach(truncateAll);

describe('concurrent PUT /users/:id/status', () => {
  it('different target statuses on the same user: no deadlock, no 500, one status wins', async () => {
    const admin = await createUserWithRole('admin', 'admin');
    const token = await accessTokenFor(admin);
    const { sub, sid } = jwt.decode(token) as { sub: string; sid: string };
    const elevation = signElevationToken({ userId: sub, role: 'admin', sid });

    for (let i = 0; i < LOOP_ITERATIONS; i++) {
      const target = await createActiveUser(`target${i}`);
      await seedRefreshToken(target.id, `tok-${i}`);

      const statuses = Array.from({ length: N }, (_, k) => (k % 2 === 0 ? 'suspended' : 'active'));
      const reasonFor = { suspended: 'FRAUD_OR_SCAM', active: 'ISSUE_RESOLVED' } as const;
      const rs = await Promise.all(
        statuses.map((status) =>
          api()
            .put(`/users/${target.id}/status`)
            .set('Authorization', bearer(token))
            .set('Elevated-Token', elevation)
            .send({ status, reason: reasonFor[status] }),
        ),
      );

      expect(rs.filter((r) => r.status === 500)).toHaveLength(0);
      expect(rs.every((r) => r.status === 200)).toBe(true);

      // Exactly one final status, and it is one of the two requested.
      const finalStatus = (await getUserByEmail(target.email))!.status;
      expect(['active', 'suspended']).toContain(finalStatus);

      // A request that saw or set 'suspended' means the tokens were revoked in that same
      // locked transaction, so none may be left live.
      if (rs.some((r) => r.body.status === 'suspended')) {
        const tokens = await getRefreshTokens(target.id);
        expect(tokens.every((t) => t.is_revoked)).toBe(true);
      }

      // Exactly one audit row per actual transition: consecutive rows chain
      // before -> after, and the chain ends at the final DB status. A no-op leaves no row,
      // so there is no link to break this chain.
      const rows = await getAuditLogRowsForTarget(target.id);
      expect(rows.length).toBeGreaterThan(0);
      for (let j = 1; j < rows.length; j++) {
        expect(rows[j]!.before).toEqual(rows[j - 1]!.after);
      }
      expect((rows.at(-1)!.after as { status: string }).status).toBe(finalStatus);
    }
  });
});

describe('concurrent PUT /users/:id/role', () => {
  it('different roles on the same target: no deadlock, no 500, one role wins', async () => {
    const superAdmin = await createUserWithRole('sa', 'super admin');
    const token = await accessTokenFor(superAdmin);
    const { sub, sid } = jwt.decode(token) as { sub: string; sid: string };
    const elevation = signElevationToken({ userId: sub, role: 'super admin', sid });

    for (let i = 0; i < LOOP_ITERATIONS; i++) {
      const target = await createActiveUser(`roletarget${i}`);
      await seedRefreshToken(target.id, `role-tok-${i}`);

      const roles = Array.from({ length: N }, (_, k) => (k % 2 === 0 ? 'admin' : 'user'));
      const reasonFor = { admin: 'APPOINTED_MODERATOR', user: 'ROLE_ENDED' } as const;
      const rs = await Promise.all(
        roles.map((role) =>
          api()
            .put(`/users/${target.id}/role`)
            .set('Authorization', bearer(token))
            .set('Elevated-Token', elevation)
            .send({ role, reason: reasonFor[role] }),
        ),
      );

      expect(rs.filter((r) => r.status === 500)).toHaveLength(0);
      expect(rs.every((r) => r.status === 200)).toBe(true);

      const finalRole = (await getUserByEmail(target.email))!.role;
      expect(['admin', 'user']).toContain(finalRole);

      // The target started as 'user', so any response showing 'admin' means a promotion
      // committed, and it revoked the tokens in that same locked transaction.
      if (rs.some((r) => r.body.role === 'admin')) {
        const tokens = await getRefreshTokens(target.id);
        expect(tokens.every((t) => t.is_revoked)).toBe(true);
      }

      const rows = await getAuditLogRowsForTarget(target.id);
      expect(rows.length).toBeGreaterThan(0);
      for (let j = 1; j < rows.length; j++) {
        expect(rows[j]!.before).toEqual(rows[j - 1]!.after);
      }
      expect((rows.at(-1)!.after as { role: string }).role).toBe(finalRole);
    }
  });
});
