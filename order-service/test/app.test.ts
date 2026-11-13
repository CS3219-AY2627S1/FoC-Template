import assert from "node:assert/strict";
import { test } from "node:test";
import type { AddressInfo } from "node:net";

// The app needs a database address to load, but these requests are answered before any query.
process.env.DATABASE_URL ??= "postgres://unused@127.0.0.1:1/unused";
process.env.LOG_LEVEL = "silent";
// Only the user-service call is answered here; the test's own requests to the app go out for real.
// Every session is a member, and only the session "admin" is an administrator as well.
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
    if (!String(url).endsWith("/internal/authorize")) return realFetch(url, init);
    const { token, requiredRole } = JSON.parse(String(init?.body));
    return requiredRole === "administrator" && token !== "admin"
        ? Response.json({ decision: "denied" })
        : Response.json({ decision: "authorized", accountId: "account" });
};
const { createApp } = await import("../src/app.ts");

async function withApp(run: (base: string) => Promise<void>) {
    const server = createApp().listen(0);
    try {
        await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    } finally {
        server.close();
    }
}

const session = { cookie: "relay_session=valid", "content-type": "application/json" };

test("a status change names the field when the state is not one a participant can ask for", async () => {
    await withApp(async (base) => {
        for (const body of [{ status: "Expired" }, { status: "Open" }, {}]) {
            const response = await fetch(`${base}/orders/1/status`, { method: "PATCH", headers: session, body: JSON.stringify(body) });
            assert.equal(response.status, 400);
            assert.deepEqual(await response.json(), { error: {
                code: "VALIDATION_FAILED",
                message: "One or more fields are invalid",
                details: { fields: { status: ["must be PickedUp, Delivered, Completed or Cancelled"] } },
            } });
        }
    });
});

test("errors use the shape the web client reads", async () => {
    await withApp(async (base) => {
        const badId = await fetch(`${base}/orders/abc/status`, { method: "PATCH", headers: session, body: JSON.stringify({ status: "PickedUp" }) });
        assert.equal(badId.status, 404);
        assert.equal((await badId.json()).error.code, "ORDER_NOT_FOUND");

        const badJson = await fetch(`${base}/orders`, { method: "POST", headers: session, body: "{" });
        assert.equal(badJson.status, 400);
        assert.equal((await badJson.json()).error.code, "INVALID_JSON");

        const noSession = await fetch(`${base}/orders/open`);
        assert.equal(noSession.status, 401);
        assert.deepEqual(await noSession.json(), { error: { code: "UNAUTHENTICATED", message: "A session is required" } });
    });
});

test("the admin routes need the administrator role, and a member is refused before the id is even read", async () => {
    await withApp(async (base) => {
        for (const [method, path] of [["GET", "/orders/admin"], ["GET", "/orders/admin/abc"], ["POST", "/orders/admin/abc/cancel"]]) {
            const member = await fetch(`${base}${path}`, { method, headers: session });
            assert.equal(member.status, 403, `${method} ${path} as a member`);
            assert.equal((await member.json()).error.code, "FORBIDDEN");
        }
        // Past the role check the invalid id is the answer, so the administrator got through.
        const admin = { ...session, cookie: "relay_session=admin" };
        for (const [method, path] of [["GET", "/orders/admin/abc"], ["POST", "/orders/admin/abc/cancel"]]) {
            const response = await fetch(`${base}${path}`, { method, headers: admin });
            assert.equal(response.status, 404, `${method} ${path} as an administrator`);
            assert.equal((await response.json()).error.code, "ORDER_NOT_FOUND");
        }
    });
});
