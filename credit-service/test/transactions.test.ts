import { test } from "node:test";
import assert from "node:assert/strict";
import { paginationParams } from "../src/utils/pagination.ts";
import { isAdministrator } from "../src/middleware.ts/auth.ts";

// The admin ledger paginates the whole collection, so a bad query must not ask for everything or a
// negative slice.
test("pagination defaults to page 1, size 20", () => {
    assert.deepEqual(paginationParams({}), { page: 1, pageSize: 20 });
});

test("pagination reads valid numbers from the query", () => {
    assert.deepEqual(paginationParams({ page: "3", pageSize: "50" }), { page: 3, pageSize: 50 });
});

test("pagination clamps out-of-range and junk values", () => {
    assert.deepEqual(paginationParams({ page: "0", pageSize: "500" }), { page: 1, pageSize: 100 });
    assert.deepEqual(paginationParams({ page: "-2", pageSize: "abc" }), { page: 1, pageSize: 20 });
});

// Only an administrator may read everyone's ledger.
test("the ledger is administrators only", () => {
    assert.equal(isAdministrator(["member", "administrator"]), true);
    assert.equal(isAdministrator(["member"]), false);
    assert.equal(isAdministrator(undefined), false);
});
