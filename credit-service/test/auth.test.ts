import { test } from "node:test";
import assert from "node:assert/strict";
import { canReadAccount } from "../src/middleware.ts/auth.ts";

// A balance or ledger belongs to one account. These guard the browser-facing reads (F4.1.4, F4.5.3)
// against reading another account by changing the id in the URL.
test("a member may read only their own account", () => {
    assert.equal(canReadAccount("me", ["member"], "me"), true);
    assert.equal(canReadAccount("me", ["member"], "someone-else"), false);
});

test("an administrator may read any account", () => {
    assert.equal(canReadAccount("admin", ["member", "administrator"], "someone-else"), true);
});

test("a missing or malformed identity is refused", () => {
    assert.equal(canReadAccount(undefined, undefined, "someone-else"), false);
    assert.equal(canReadAccount("me", "administrator", "someone-else"), false);
});
