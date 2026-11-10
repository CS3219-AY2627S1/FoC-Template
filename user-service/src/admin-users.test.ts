import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { eligibleAdministrator, parseAdminChange, parseAdminSearch, parseAppealRejectionReason } from "./admin-users";
import { AppError } from "./errors";

describe("admin user input and eligibility", () => {
  it("defaults to page one, trims q and bounds pagination/search", () => {
    assert.deepEqual(parseAdminSearch(undefined, undefined), { q: "", page: 1 });
    assert.deepEqual(parseAdminSearch(" Example ", "2"), { q: "Example", page: 2 });
    assert.deepEqual(parseAdminSearch("a".repeat(100), "100000"), { q: "a".repeat(100), page: 100000 });
    for (const page of ["0", "-1", "1.5", "01", "1e2", "100001", "99999999999999", ["1"], {}]) {
      assert.throws(() => parseAdminSearch("", page));
    }
    for (const q of ["a".repeat(101), ["a"], {}]) assert.throws(() => parseAdminSearch(q, "1"));
  });
  it("accepts only the agreed lowercase role/status commands", () => {
    for (const value of ["user", "admin"]) assert.deepEqual(parseAdminChange("role", { role: value }), { kind: "role", value });
    for (const value of ["verified", "suspended"]) assert.deepEqual(parseAdminChange("status", { status: value }), { kind: "status", value });
    for (const value of [undefined, null, "ADMIN", "root", true, ["admin"]]) assert.throws(() => parseAdminChange("role", { role: value }));
    for (const body of [undefined, null, "verified", { status: "Created" }, { status: "active" }]) assert.throws(() => parseAdminChange("status", body));
  });
  it("accepts only the exact optional account-status search values", () => {
    for (const status of ["Created", "Verified", "Suspended"]) {
      assert.deepEqual(parseAdminSearch(" user ", "2", status), { q: "user", page: 2, status });
    }
    for (const status of ["", "suspended", "ACTIVE", " Verified ", ["Created"], {}, null, 1]) {
      assert.throws(() => parseAdminSearch(undefined, undefined, status), (e: unknown) => e instanceof AppError
        && e.status === 400 && e.code === "INVALID_STATUS");
    }
  });
  it("trims and bounds the appeal rejection notification reason", () => {
    assert.equal(parseAppealRejectionReason(" A reason "), "A reason");
    assert.equal(parseAppealRejectionReason("x".repeat(4000)).length, 4000);
    for (const value of [undefined, null, "", "  ", "x".repeat(4001), ["reason"], {}, true]) {
      assert.throws(() => parseAppealRejectionReason(value), (e: unknown) => e instanceof AppError && e.code === "INVALID_REASON");
    }
  });
  it("requires a fully verified, active, unlocked admin without pending deletion", () => {
    const eligible = { role: "ADMIN" as const, accessStatus: "ACTIVE" as const,
      emailVerifiedAt: new Date(), telegramVerifiedAt: new Date(), lockedAt: null,
      deletionRequestedAt: null, scheduledDeletionAt: null };
    assert.equal(eligibleAdministrator(eligible), true);
    for (const invalid of [{ role: "USER" as const }, { accessStatus: "SUSPENDED" as const },
      { emailVerifiedAt: null }, { telegramVerifiedAt: null }, { lockedAt: new Date() },
      { deletionRequestedAt: new Date() }, { scheduledDeletionAt: new Date() }]) {
      assert.equal(eligibleAdministrator({ ...eligible, ...invalid }), false);
    }
  });
});
