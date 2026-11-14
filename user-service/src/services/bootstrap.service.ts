// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-25
// 25/09/2026: Stage 4e - super admin bootstrap
// Author review:
// 2026-10-02: Add bootstrapTestUser (optional seeded normal user, same env-var pattern)
// Author review: Congchen
// 2026-10-21: Stage 14d - create the super admin and its credit-allocation outbox row in one
//   transaction, only when creation actually happened. No requirements, architecture, schema,
//   or API decisions were made by the AI tool — see instructions.md Stage 14 for the governing
//   decision.
// Author review:
// 2026-10-22: Fix - bootstrapTestUser now creates its credit-allocation outbox row in the same
//   transaction as the user, matching bootstrapSuperAdmin and the registration flow
//   (auth.service.ts), so the seeded test user gets the same 20-credit allocation. No
//   requirements, architecture, schema, or API decisions were made by the AI tool — this applies
//   the existing governing decision in instructions.md ("one credit_allocation_outbox row for
//   that user, created in the same transaction").
// Author review:

import bcrypt from 'bcrypt';
import { config } from '../config.js';
import * as creditOutboxQueries from '../db/queries/creditOutbox.queries.js';
import * as userQueries from '../db/queries/users.queries.js';
import { withTransaction } from '../db/transaction.js';
import { PASSWORD_REGEX } from './auth.service.js';

const BCRYPT_WORK_FACTOR = 10;

export async function bootstrapSuperAdmin(): Promise<void> {
  const existing = await userQueries.findSuperAdmin();
  if (existing) {
    return;
  }

  if (!PASSWORD_REGEX.test(config.superAdmin.password)) {
    throw new Error(
      'SUPER_ADMIN_PASSWORD does not meet the required complexity: min 8 characters, with at least one uppercase, one lowercase, one digit and one special character.',
    );
  }

  const passwordHash = await bcrypt.hash(config.superAdmin.password, BCRYPT_WORK_FACTOR);

  const created = await withTransaction(async (client) => {
    const created = await userQueries.createSuperAdmin(
      {
        username: config.superAdmin.username.trim().toLowerCase(),
        email: config.superAdmin.email.trim().toLowerCase(),
        passwordHash,
      },
      client,
    );
    if (created) {
      await creditOutboxQueries.insertCreditAllocation(created.id, client);
    }
    return created;
  });

  if (created) {
    console.log(`Super admin bootstrap: created super admin user '${config.superAdmin.username}'`);
  }

  if (await userQueries.findSuperAdmin()) {
    return;
}
throw new Error(
  'SUPER_ADMIN_USERNAME or SUPER_ADMIN_EMAIL is already used by a non-super-admin account.'
);
 
}

// Seeds a normal (non-admin) user for local development. Opt-in: does nothing unless all three
// TEST_USER_* values are set. Never modifies an existing account.
//
// 2026-10-22: creates the user and its credit-allocation outbox row in the same transaction,
// matching bootstrapSuperAdmin and the registration flow (auth.service.ts), so the seeded user
// gets the same 20-credit allocation per the governing decision in instructions.md Stage 15/16
// ("one credit_allocation_outbox row for that user, created in the same transaction"). Previously
// this bootstrap created the user with no outbox row, so Credit Service never saw a balance for
// it.
export async function bootstrapTestUser(): Promise<void> {
  const { username, email, password } = config.testUser;
  if (!username || !email || !password) {
    return;
  }

  if (!PASSWORD_REGEX.test(password)) {
    throw new Error(
      'TEST_USER_PASSWORD does not meet the required complexity: min 8 characters, with at least one uppercase, one lowercase, one digit and one special character.',
    );
  }

  const normalisedUsername = username.trim().toLowerCase();
  const normalisedEmail = email.trim().toLowerCase();

  if (
    (await userQueries.findByUsername(normalisedUsername)) ||
    (await userQueries.findByEmail(normalisedEmail))
  ) {
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_WORK_FACTOR);
  await withTransaction(async (client) => {
    const created = await userQueries.createUser(
      {
        username: normalisedUsername,
        email: normalisedEmail,
        passwordHash,
        status: 'active',
      },
      client,
    );
    await creditOutboxQueries.insertCreditAllocation(created.id, client);
  });
  console.log(`Test user bootstrap: created user '${normalisedUsername}'`);
}
