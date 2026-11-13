import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequireAuth } from "../src/middleware/auth.middleware.ts";

async function authorize(cookie: string | undefined, request: typeof fetch, role?: "member" | "administrator") {
    let status = 200;
    let next = false;
    const response: any = { locals: {}, status(value: number) { status = value; return this; }, json() {} };
    await createRequireAuth("http://user:3000", role, request)(
        { headers: { cookie, "x-user-id": "spoofed" } } as any, response, () => { next = true; },
    );
    return { status, next, accountId: response.locals.accountId };
}

test("authorization asks the real user contract and uses only its returned identity", async () => {
    const result = await authorize("other=1; relay_session=valid", async (url, init) => {
        assert.equal(String(url), "http://user:3000/internal/authorize");
        assert.deepEqual(JSON.parse(String(init?.body)), { token: "valid", requiredRole: "member" });
        return new Response(JSON.stringify({ decision: "authorized", accountId: "actual-account", roles: ["member"] }));
    });
    assert.deepEqual(result, { status: 200, next: true, accountId: "actual-account" });
});

test("the admin check asks the user-service for the administrator role", async () => {
    const result = await authorize("relay_session=valid", async (_url, init) => {
        assert.deepEqual(JSON.parse(String(init?.body)), { token: "valid", requiredRole: "administrator" });
        return new Response(JSON.stringify({ decision: "authorized", accountId: "admin-account", roles: ["member", "administrator"] }));
    }, "administrator");
    assert.deepEqual(result, { status: 200, next: true, accountId: "admin-account" });
});

test("missing sessions, denied decisions, malformed replies and outages fail closed", async () => {
    assert.equal((await authorize(undefined, async () => { throw new Error("must not be called"); })).status, 401);
    for (const reply of [{ decision: "denied" }, { decision: "authorized" }, { userId: "old-contract" }]) {
        assert.deepEqual(await authorize("relay_session=valid", async () => new Response(JSON.stringify(reply))),
            { status: 403, next: false, accountId: undefined });
    }
    assert.equal((await authorize("relay_session=valid", async () => { throw new Error("offline"); })).status, 403);
});
