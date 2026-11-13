// AI Assistance Disclosure:
// Tool: GitHub Copilot (Copilot SDK in VS Code), date: 2026-11-10
// Scope: Added unit tests for user, authentication, role, and wallet services.
// Author review: Tests reviewed and verified by author

import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import type { TestContext } from "node:test";
import type { PoolClient } from "pg";

process.env.JWT_SECRET ??= "unit-test-secret-that-is-long-enough";
const [{ pool }, validators, passwords, jwtUtils, auth, users, roles, credit] = await Promise.all([
  import("../src/config/db.js"),
  import("../src/utils/validators.js"),
  import("../src/utils/password.js"),
  import("../src/utils/jwt.js"),
  import("../src/services/authService.js"),
  import("../src/services/userService.js"),
  import("../src/services/roleService.js"),
  import("../src/services/creditService.js"),
]);

type DbResult = { rows: Record<string, any>[]; rowCount?: number | null };
type QueryCall = { sql: string; params?: unknown[] };

const mockQueries = (t: TestContext, results: Array<DbResult | Error>) => {
  const calls: QueryCall[] = [];
  t.mock.method(pool, "query", async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    const result = results.shift() ?? { rows: [] };
    if (result instanceof Error) throw result;
    return { ...result, rowCount: result.rowCount ?? result.rows.length };
  });
  return calls;
};

const mockClient = (t: TestContext, results: Array<DbResult | Error>) => {
  const calls: QueryCall[] = [];
  let released = false;
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      const result = results.shift() ?? { rows: [] };
      if (result instanceof Error) throw result;
      return { ...result, rowCount: result.rowCount ?? result.rows.length };
    },
    release: () => {
      released = true;
    },
  };
  t.mock.method(pool, "connect", async () => client as PoolClient);
  return { calls, isReleased: () => released };
};

const sampleUserRow = {
  id: "user-1",
  username: "sam",
  email: "sam@u.nus.edu",
  first_name: "Sam",
  last_name: "Tan",
  is_active: true,
};

after(() => {
  delete process.env.INITIAL_CREDITS;
});

describe("user service validators and security utilities", () => {
  it("validates emails, NUS domains, passwords, non-empty strings, and UUIDs", () => {
    assert.equal(validators.isValidEmail("a.b+tag@u.nus.edu"), true);
    assert.equal(validators.isValidEmail("not-an-email"), false);
    assert.equal(validators.isAllowedNusEmail("user@u.nus.edu"), true);
    assert.equal(validators.isAllowedNusEmail("user@u.yale-nus.edu.sg"), true);
    assert.equal(validators.isAllowedNusEmail("user@example.com"), false);
    assert.equal(validators.isValidPassword("123456789012345"), true);
    assert.equal(validators.isValidPassword("12345678901234"), false);
    assert.equal(validators.isNonEmptyString("  "), false);
    assert.equal(validators.isNonEmptyString(" ok "), true);
    assert.equal(validators.isValidUuid("a01f1234-1234-1234-1234-123456789abc"), true);
    assert.equal(validators.isValidUuid("not-a-uuid"), false);
  });

  it("hashes passwords and compares matching or non-matching values", async () => {
    const hash = await passwords.hashPassword("a sufficiently long password");
    assert.notEqual(hash, "a sufficiently long password");
    assert.equal(await passwords.comparePassword("a sufficiently long password", hash), true);
    assert.equal(await passwords.comparePassword("wrong password", hash), false);
  });

  it("generates verifiable access and refresh tokens and stable token hashes", () => {
    const accessToken = jwtUtils.generateAccessToken("user-1", ["REQUESTER"]);
    assert.equal(jwtUtils.verifyAccessToken(accessToken).sub, "user-1");
    assert.deepEqual(jwtUtils.verifyAccessToken(accessToken).roles, ["REQUESTER"]);
    const refreshToken = jwtUtils.generateRefreshToken();
    assert.equal(refreshToken.length, 64);
    assert.equal(jwtUtils.hashToken(refreshToken), jwtUtils.hashToken(refreshToken));
    assert.notEqual(jwtUtils.hashToken(refreshToken), refreshToken);
  });
});

describe("authentication service", () => {
  it("registers a normalized user with default roles and initializes their wallet", async (t) => {
    const previousFetch = globalThis.fetch;
    t.after(() => {
      globalThis.fetch = previousFetch;
    });
    let walletRequest: RequestInit | undefined;
    globalThis.fetch = async (_input, init) => {
      walletRequest = init;
      return new Response(null, { status: 201 });
    };

    const client = mockClient(t, [
      { rows: [] },
      { rows: [] },
      { rows: [{ id: "user-1", username: "sam", email: "sam@u.nus.edu", first_name: "Sam", last_name: "Tan" }] },
      { rows: [{ id: 1, name: "REQUESTER" }, { id: 2, name: "COURIER" }] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
    ]);

    const result = await auth.register({
      username: " sam ",
      email: " SAM@U.NUS.EDU ",
      password: "a sufficiently long password",
      firstName: " Sam ",
      lastName: " Tan ",
    });

    assert.deepEqual(result, {
      id: "user-1",
      username: "sam",
      email: "sam@u.nus.edu",
      firstName: "Sam",
      lastName: "Tan",
      roles: ["REQUESTER", "COURIER"],
    });
    assert.equal(client.calls[0].sql, "BEGIN");
    assert.deepEqual(client.calls[2].params?.slice(0, 2), ["sam", "sam@u.nus.edu"]);
    assert.deepEqual(client.calls[4].params, ["user-1", 1]);
    assert.equal(walletRequest?.method, "POST");
    assert.equal(client.calls.at(-1)?.sql, "COMMIT");
    assert.equal(client.isReleased(), true);
  });

  it("rejects invalid registration before opening a database connection", async (t) => {
    const connect = t.mock.method(pool, "connect");
    await assert.rejects(
      auth.register({
        username: "sam",
        email: "sam@example.com",
        password: "short",
        firstName: "Sam",
        lastName: "Tan",
      }),
      (error: Error & { statusCode?: number }) => error.statusCode === 400,
    );
    assert.equal(connect.mock.calls.length, 0);
  });

  it("rolls back registration on duplicate users and always releases the client", async (t) => {
    const client = mockClient(t, [{ rows: [] }, { rows: [{ id: "existing" }] }, { rows: [] }]);
    await assert.rejects(
      auth.register({
        username: "sam",
        email: "sam@u.nus.edu",
        password: "a sufficiently long password",
        firstName: "Sam",
        lastName: "Tan",
      }),
      (error: Error & { statusCode?: number }) => error.statusCode === 409,
    );
    assert.equal(client.calls.at(-1)?.sql, "ROLLBACK");
    assert.equal(client.isReleased(), true);
  });

  it("logs in an active user and stores only a hashed refresh token", async (t) => {
    const passwordHash = await passwords.hashPassword("a sufficiently long password");
    const calls = mockQueries(t, [
      { rows: [{ ...sampleUserRow, password_hash: passwordHash }] },
      { rows: [{ name: "REQUESTER" }] },
      { rows: [] },
    ]);
    const result = await auth.login({ identifier: " sam ", password: "a sufficiently long password" });

    assert.equal(jwtUtils.verifyAccessToken(result.accessToken).sub, "user-1");
    assert.equal(result.refreshToken.length, 64);
    assert.equal(result.user.email, "sam@u.nus.edu");
    assert.deepEqual(calls[0].params, ["sam"]);
    assert.equal(calls[2].sql.includes("INSERT INTO refresh_tokens"), true);
    assert.equal(calls[2].params?.[1], jwtUtils.hashToken(result.refreshToken));
  });

  it("rejects missing credentials, unknown users, inactive users, and wrong passwords", async (t) => {
    await assert.rejects(auth.login({ identifier: " ", password: "secret" }), /required/);

    mockQueries(t, [{ rows: [] }]);
    await assert.rejects(auth.login({ identifier: "unknown", password: "secret" }),
      (error: Error & { statusCode?: number }) => error.statusCode === 401);

    mockQueries(t, [{ rows: [{ ...sampleUserRow, is_active: false, password_hash: "unused" }] }]);
    await assert.rejects(auth.login({ identifier: "sam", password: "secret" }),
      (error: Error & { statusCode?: number }) => error.statusCode === 403);

    const passwordHash = await passwords.hashPassword("a sufficiently long password");
    mockQueries(t, [{ rows: [{ ...sampleUserRow, password_hash: passwordHash }] }]);
    await assert.rejects(auth.login({ identifier: "sam", password: "wrong password" }),
      (error: Error & { statusCode?: number }) => error.statusCode === 401);
  });

  it("rotates a valid refresh token and revokes the old one", async (t) => {
    const rawToken = "existing-refresh-token";
    const calls = mockQueries(t, [
      { rows: [{ id: 5, user_id: "user-1", expires_at: new Date(Date.now() + 60_000), revoked: false }] },
      { rows: [sampleUserRow] },
      { rows: [{ name: "REQUESTER" }] },
      { rows: [] },
      { rows: [] },
    ]);
    const result = await auth.refresh({ refreshToken: ` ${rawToken} ` });
    assert.equal(result.user.id, "user-1");
    assert.notEqual(result.refreshToken, rawToken);
    assert.deepEqual(calls[0].params, [jwtUtils.hashToken(rawToken)]);
    assert.match(calls[3].sql, /SET revoked = true/);
    assert.equal(calls[4].params?.[1], jwtUtils.hashToken(result.refreshToken));
  });

  it("rejects blank, missing, revoked, and expired refresh tokens", async (t) => {
    await assert.rejects(auth.refresh({ refreshToken: " " }), /required/);
    mockQueries(t, [{ rows: [] }]);
    await assert.rejects(auth.refresh({ refreshToken: "missing" }),
      (error: Error & { statusCode?: number }) => error.statusCode === 401);
    mockQueries(t, [{ rows: [{ id: 1, revoked: true }] }]);
    await assert.rejects(auth.refresh({ refreshToken: "revoked" }), /revoked/);
    mockQueries(t, [{ rows: [{ id: 2, revoked: false, expires_at: new Date(Date.now() - 1) }] }]);
    await assert.rejects(auth.refresh({ refreshToken: "expired" }), /expired/);
  });

  it("revokes access and optional refresh tokens on logout", async (t) => {
    const calls = mockQueries(t, [{ rows: [] }, { rows: [] }]);
    await auth.logout({ userId: "user-1", jti: "token-id", exp: 1_800_000_000, refreshToken: "refresh" });
    assert.match(calls[0].sql, /INSERT INTO revoked_tokens/);
    assert.deepEqual(calls[0].params, ["token-id", "user-1", new Date(1_800_000_000_000)]);
    assert.deepEqual(calls[1].params, [jwtUtils.hashToken("refresh")]);

    const noRefreshCalls = mockQueries(t, [{ rows: [] }]);
    await auth.logout({ userId: "user-1", jti: "token-id", exp: 1_800_000_000, refreshToken: " " });
    assert.equal(noRefreshCalls.length, 1);
  });
});

describe("user profile and administration service", () => {
  it("provisions the initial admin with all built-in roles and a wallet", async (t) => {
    const previousFetch = globalThis.fetch;
    t.after(() => {
      globalThis.fetch = previousFetch;
    });
    globalThis.fetch = async () => new Response(null, { status: 201 });
    const calls: QueryCall[] = [];
    const rows = [
      { rows: [] },
      { rows: [{ id: "admin-1" }] },
      { rows: [{ id: 1, name: "ADMIN" }, { id: 2, name: "REQUESTER" }, { id: 3, name: "COURIER" }] },
      { rows: [] }, { rows: [] }, { rows: [] },
    ];
    const client = {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        return rows.shift() ?? { rows: [] };
      },
    };

    await users.provisionInitialAdmin({
      username: " admin ",
      email: " ADMIN@U.NUS.EDU ",
      password: "a sufficiently long password",
      firstName: " Admin ",
      lastName: " User ",
    }, client as unknown as PoolClient);

    assert.deepEqual(calls[0].params, ["admin@u.nus.edu", "admin"]);
    assert.equal(calls[1].params?.[0], "admin");
    assert.equal(calls[3].params?.[1], 1);
    assert.equal(calls[5].params?.[1], 3);

    const missingRolesClient = {
      query: async (sql: string) => {
        if (sql.includes("SELECT id") && sql.includes("WHERE email")) return { rows: [] };
        if (sql.includes("INSERT INTO users")) return { rows: [{ id: "admin-2" }] };
        if (sql.includes("FROM roles")) return { rows: [{ id: 1, name: "ADMIN" }] };
        return { rows: [] };
      },
    };
    await assert.rejects(users.provisionInitialAdmin({
      username: "admin2",
      email: "admin2@u.nus.edu",
      password: "a sufficiently long password",
      firstName: "Admin",
      lastName: "Two",
    }, missingRolesClient as unknown as PoolClient), /Required roles are missing/);
  });

  it("returns an active user's profile with roles and returns 404 for missing users", async (t) => {
    mockQueries(t, [
      { rows: [sampleUserRow] },
      { rows: [{ name: "COURIER" }, { name: "REQUESTER" }] },
    ]);
    assert.deepEqual(await users.getCurrentUserProfile("user-1"), {
      id: "user-1", username: "sam", email: "sam@u.nus.edu",
      firstName: "Sam", lastName: "Tan", roles: ["COURIER", "REQUESTER"],
    });

    mockQueries(t, [{ rows: [] }]);
    await assert.rejects(users.getCurrentUserProfile("missing"),
      (error: Error & { statusCode?: number }) => error.statusCode === 404);
  });

  it("normalizes profile updates and rejects empty, invalid, or duplicate fields", async (t) => {
    const calls = mockQueries(t, [
      { rows: [{ id: "user-1" }] },
      { rows: [sampleUserRow] },
      { rows: [{ name: "REQUESTER" }] },
    ]);
    const result = await users.updateCurrentUserProfile("user-1", { email: " SAM@U.NUS.EDU ", firstName: " Sam " });
    assert.equal(result.email, "sam@u.nus.edu");
    assert.deepEqual(calls[0].params, [null, "sam@u.nus.edu", "Sam", null, "user-1"]);

    await assert.rejects(users.updateCurrentUserProfile("user-1", {}), /At least one field/);
    await assert.rejects(users.updateCurrentUserProfile("user-1", { username: " " }), /must not be empty/);
    await assert.rejects(users.updateCurrentUserProfile("user-1", { email: "bad" }), /Invalid email/);
    await assert.rejects(users.updateCurrentUserProfile("user-1", { email: "x@example.com" }), /NUS email/);

    mockQueries(t, [Object.assign(new Error("duplicate"), { code: "23505", constraint: "users_username_key" })]);
    await assert.rejects(users.updateCurrentUserProfile("user-1", { username: "taken" }),
      (error: Error & { statusCode?: number }) => error.statusCode === 409);
  });

  it("returns private fields only to the user themself or an admin", async (t) => {
    mockQueries(t, [{ rows: [{ ...sampleUserRow, roles: ["REQUESTER"] }] }]);
    const self = await users.getUserProfileById("user-1", "user-1");
    assert.equal("email" in self, true);

    mockQueries(t, [{ rows: [{ ...sampleUserRow, roles: ["REQUESTER"] }] }]);
    const adminView = await users.getUserProfileById("user-1", "admin-1", ["ADMIN"]);
    assert.equal("email" in adminView, true);

    mockQueries(t, [{ rows: [{ ...sampleUserRow, roles: ["REQUESTER"] }] }]);
    const publicView = await users.getUserProfileById("user-1", "other-user");
    assert.equal("email" in publicView, false);

    mockQueries(t, [{ rows: [] }]);
    await assert.rejects(users.getUserProfileById("missing", "other-user"),
      (error: Error & { statusCode?: number }) => error.statusCode === 404);
  });

  it("returns no batch users for an empty list and deduplicates non-empty IDs", async (t) => {
    const query = t.mock.method(pool, "query");
    assert.deepEqual(await users.getUsersBatch([]), []);
    assert.equal(query.mock.calls.length, 0);

    const calls = mockQueries(t, [{ rows: [{ ...sampleUserRow, roles: ["REQUESTER"] }] }]);
    assert.deepEqual(await users.getUsersBatch(["user-1", "user-1"]), [{
      id: "user-1", username: "sam", firstName: "Sam", lastName: "Tan", roles: ["REQUESTER"],
    }]);
    assert.deepEqual(calls[0].params, [["user-1"]]);
  });

  it("changes a password and revokes active refresh tokens", async (t) => {
    const existingHash = await passwords.hashPassword("old sufficiently long password");
    const calls = mockQueries(t, [
      { rows: [{ id: "user-1", password_hash: existingHash, is_active: true }] },
      { rows: [] },
      { rows: [] },
    ]);
    await users.changePassword("user-1", {
      currentPassword: "old sufficiently long password",
      newPassword: "new sufficiently long password",
    });
    assert.notEqual(calls[1].params?.[0], existingHash);
    assert.deepEqual(calls[1].params?.[1], "user-1");
    assert.match(calls[2].sql, /revoked = true/);
  });

  it("rejects invalid password changes and incorrect current passwords", async (t) => {
    await assert.rejects(users.changePassword("user-1", { currentPassword: "", newPassword: "new password is long" }), /required/);
    await assert.rejects(users.changePassword("user-1", { currentPassword: "same", newPassword: "same" }), /same as current/);
    await assert.rejects(users.changePassword("user-1", { currentPassword: "old", newPassword: "short" }), /at least 15/);
    mockQueries(t, [{ rows: [] }]);
    await assert.rejects(users.changePassword("user-1", { currentPassword: "old", newPassword: "new sufficiently long password" }),
      (error: Error & { statusCode?: number }) => error.statusCode === 404);
    const hash = await passwords.hashPassword("actual sufficiently long password");
    mockQueries(t, [{ rows: [{ id: "user-1", password_hash: hash, is_active: true }] }]);
    await assert.rejects(users.changePassword("user-1", { currentPassword: "wrong", newPassword: "new sufficiently long password" }), /does not match/);
  });

  it("lists users with escaped search text and correct pagination", async (t) => {
    const calls = mockQueries(t, [
      { rows: [{ total: 3 }] },
      { rows: [{ ...sampleUserRow, roles: ["REQUESTER"] }] },
    ]);
    const result = await users.listUsers({ page: 2, limit: 2, search: "a%_\\b" });
    assert.deepEqual(calls[0].params, ["%a\\%\\_\\\\b%"]);
    assert.deepEqual(calls[1].params, ["%a\\%\\_\\\\b%", 2, 2]);
    assert.deepEqual(result.pagination, { page: 2, limit: 2, total: 3, totalPages: 2 });
    assert.equal(result.users[0].isActive, true);
  });

  it("deactivates another user, revokes sessions, and prevents self/last-admin deactivation", async (t) => {
    const updatedUser = {
      ...sampleUserRow,
      is_active: false,
      roles: ["REQUESTER"],
    };
    const client = mockClient(t, [
      { rows: [] }, { rows: [] }, { rows: [{ id: "user-2", is_active: true, is_admin: false }] },
      { rows: [] }, { rows: [] }, { rows: [updatedUser] }, { rows: [] },
    ]);
    assert.equal((await users.updateUserStatus("admin-1", "user-2", false)).isActive, false);
    assert.match(client.calls[4].sql, /UPDATE refresh_tokens/);
    assert.equal(client.calls[6].sql, "COMMIT");
    assert.equal(client.isReleased(), true);

    const connect = t.mock.method(pool, "connect");
    await assert.rejects(users.updateUserStatus("user-1", "user-1", false), /your own account/);
    assert.equal(connect.mock.calls.length, 0);

    const lastAdmin = mockClient(t, [
      { rows: [] },
      { rows: [] },
      { rows: [{ id: "admin-1", is_active: true, is_admin: true }] },
      { rows: [{ count: 0 }] },
      { rows: [] },
    ]);
    await assert.rejects(users.updateUserStatus("other-admin", "admin-1", false), /last active Admin/);
    assert.equal(lastAdmin.calls.at(-1)?.sql, "ROLLBACK");
    assert.equal(lastAdmin.isReleased(), true);
  });
});

describe("role service", () => {
  it("returns a user's roles and rejects invalid or missing users", async (t) => {
    mockQueries(t, [{ rows: [{ id: "a01f1234-1234-1234-1234-123456789abc" }] }, { rows: [{ name: "ADMIN" }] }]);
    assert.deepEqual(
      await roles.getUserRoles("a01f1234-1234-1234-1234-123456789abc"),
      { userId: "a01f1234-1234-1234-1234-123456789abc", roles: ["ADMIN"] },
    );
    await assert.rejects(roles.getUserRoles("bad-id"), /Invalid user ID/);
    mockQueries(t, [{ rows: [] }]);
    await assert.rejects(roles.getUserRoles("a01f1234-1234-1234-1234-123456789abc"), /User not found/);
  });

  it("adds a valid role idempotently and validates user and role existence", async (t) => {
    const id = "a01f1234-1234-1234-1234-123456789abc";
    mockQueries(t, [
      { rows: [{ id }] }, { rows: [{ id: 2 }] }, { rows: [] },
      { rows: [{ id }] }, { rows: [{ name: "COURIER" }] },
    ]);
    assert.deepEqual(await roles.addRoleToUser(id, "COURIER"), { userId: id, roles: ["COURIER"] });

    await assert.rejects(roles.addRoleToUser("bad-id", "COURIER"), /Invalid user ID/);
    await assert.rejects(roles.addRoleToUser(id, "ROOT"), /Invalid role/);
    mockQueries(t, [{ rows: [] }]);
    await assert.rejects(roles.addRoleToUser(id, "ADMIN"), /User not found/);
    mockQueries(t, [{ rows: [{ id }] }, { rows: [] }]);
    await assert.rejects(roles.addRoleToUser(id, "ADMIN"), /does not exist/);
  });

  it("removes a role only when permitted and preserves the user's last role", async (t) => {
    const id = "a01f1234-1234-1234-1234-123456789abc";
    await assert.rejects(roles.removeRoleFromUser(id, id, "ADMIN"), /yourself/);

    mockQueries(t, [
      { rows: [{ id }] },
      { rows: [{ id }] },
      { rows: [{ name: "ADMIN" }] },
    ]);
    assert.deepEqual(await roles.removeRoleFromUser("admin-2", id, "COURIER"), {
      userId: id,
      roles: ["ADMIN"],
    });

    mockQueries(t, [
      { rows: [{ id }] },
      { rows: [{ id }] },
      { rows: [{ name: "ADMIN" }] },
    ]);
    await assert.rejects(roles.removeRoleFromUser("admin-2", id, "ADMIN"), /only remaining role/);

    await assert.rejects(roles.removeRoleFromUser("admin-2", "bad-id", "ADMIN"), /Invalid user ID/);
    await assert.rejects(roles.removeRoleFromUser("admin-2", id, "ROOT"), /Invalid role/);

    const calls = mockQueries(t, [
      { rows: [{ id }] },
      { rows: [{ id }] }, { rows: [{ name: "ADMIN" }, { name: "COURIER" }] },
      { rows: [{ id: 2 }] }, { rows: [] },
      { rows: [{ id }] }, { rows: [{ name: "ADMIN" }] },
    ]);
    assert.deepEqual(await roles.removeRoleFromUser("admin-2", id, "COURIER"), {
      userId: id,
      roles: ["ADMIN"],
    });
    assert.match(calls[4].sql, /DELETE FROM user_roles/);
  });
});

describe("wallet initialization client", () => {
  it("sends an encoded user id and reports network or HTTP failures", async (t) => {
    const previousFetch = globalThis.fetch;
    t.after(() => {
      globalThis.fetch = previousFetch;
    });
    let requestedUrl = "";
    globalThis.fetch = async (input) => {
      requestedUrl = String(input);
      return new Response(null, { status: 201 });
    };
    await credit.initializeWallet("id/with space");
    assert.match(requestedUrl, /id%2Fwith%20space/);

    globalThis.fetch = async () => new Response(null, { status: 500 });
    await assert.rejects(credit.initializeWallet("user-1"),
      (error: Error & { statusCode?: number }) => error.statusCode === 503);
    globalThis.fetch = async () => {
      throw new Error("offline");
    };
    await assert.rejects(credit.initializeWallet("user-1"),
      (error: Error & { statusCode?: number }) => error.statusCode === 503);
  });
});
