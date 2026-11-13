import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { SessionModel } from "../src/models/session.model.ts";
import { UserModel } from "../src/models/user.model.ts";
import { useTestDatabase } from "./helpers/db.ts";
import { app, createUser, loginAs, PASSWORD, sessionTokenOf } from "./helpers/users.ts";

useTestDatabase();

const ADMIN_ROLES = ["member", "administrator"] as const;

function stateChange(actorId: string, from: string, to: string, at: string) {
    return { changeId: randomUUID(), from, to, reason: `${to} after the conduct review on ${at}`, actorId, at: new Date(at) };
}

describe("state history (F1.6.2)", () => {
    it("is part of an account as an administrator sees it", async () => {
        await createUser({ username: "admin", roles: [...ADMIN_ROLES] });
        const carol = await createUser({ username: "carol" });
        const admin = await loginAs("admin");

        const response = await admin.get(`/users/${carol}`).expect(200);

        expect(response.body).toMatchObject({ id: carol, state: "Active", stateChanges: [] });
    });

    it("lists the changes newest first with the acting administrator", async () => {
        const adminId = await createUser({ username: "admin", roles: [...ADMIN_ROLES] });
        const carol = await createUser({ username: "carol" });
        const goneAdmin = randomUUID();
        await UserModel.updateOne(
            { _id: carol },
            {
                $push: {
                    stateChanges: [
                        stateChange(goneAdmin, "Active", "Suspended", "2026-10-01T08:00:00.000Z"),
                        stateChange(adminId, "Suspended", "Active", "2026-10-02T08:00:00.000Z"),
                    ],
                },
            },
        );
        const admin = await loginAs("admin");

        const response = await admin.get(`/users/${carol}`).expect(200);

        expect(response.body.stateChanges).toMatchObject([
            {
                from: "Suspended",
                to: "Active",
                reason: "Active after the conduct review on 2026-10-02T08:00:00.000Z",
                actor: { id: adminId, fullName: "admin", username: "admin", state: "Active" },
                at: "2026-10-02T08:00:00.000Z",
            },
            // An administrator deleted since then shows as null instead of failing the request.
            { from: "Active", to: "Suspended", actor: null, at: "2026-10-01T08:00:00.000Z" },
        ]);
        expect(response.body.stateChanges[0].id).toEqual(expect.any(String));
    });

    it("is never shown to the account holder or in the account list", async () => {
        await createUser({ username: "admin", roles: [...ADMIN_ROLES] });
        await createUser({ username: "alice" });
        const member = await loginAs("alice");
        const admin = await loginAs("admin");

        const me = await member.get("/users/me").expect(200);
        const list = await admin.get("/users").expect(200);

        expect(me.body).not.toHaveProperty("stateChanges");
        expect(list.body.items[0]).not.toHaveProperty("stateChanges");
    });
});

describe("suspending and reinstating (F1.6.2)", () => {
    const REASON = "Did not deliver three accepted errands";

    it("suspends an Active account and records actor, reason and time", async () => {
        const adminId = await createUser({ username: "admin", roles: [...ADMIN_ROLES] });
        const carol = await createUser({ username: "carol" });
        const admin = await loginAs("admin");
        const before = Date.now();

        const response = await admin.put(`/users/${carol}/state`).send({ state: "Suspended", reason: `  ${REASON}  ` }).expect(200);

        expect(response.body).toMatchObject({
            id: carol,
            state: "Suspended",
            stateChanges: [{ from: "Active", to: "Suspended", reason: REASON, actor: { id: adminId, username: "admin" } }],
        });
        expect(Date.parse(response.body.stateChanges[0].at)).toBeGreaterThanOrEqual(before);
        expect(await UserModel.findById(carol)).toMatchObject({ state: "Suspended" });
    });

    it("reinstates a Suspended account and keeps the earlier change", async () => {
        await createUser({ username: "admin", roles: [...ADMIN_ROLES] });
        const carol = await createUser({ username: "carol" });
        const admin = await loginAs("admin");

        await admin.put(`/users/${carol}/state`).send({ state: "Suspended", reason: REASON }).expect(200);
        const response = await admin
            .put(`/users/${carol}/state`)
            .send({ state: "Active", reason: "Explained the missed errands, first warning" })
            .expect(200);

        expect(response.body.state).toBe("Active");
        expect(response.body.stateChanges).toMatchObject([
            { from: "Suspended", to: "Active" },
            { from: "Active", to: "Suspended" },
        ]);
        await loginAs("carol");
    });

    it("refuses a reason outside 20 to 500 characters or an unknown state and changes nothing", async () => {
        await createUser({ username: "admin", roles: [...ADMIN_ROLES] });
        const carol = await createUser({ username: "carol" });
        const admin = await loginAs("admin");

        // 19 characters once the spaces are trimmed
        const tooShort = await admin.put(`/users/${carol}/state`).send({ state: "Suspended", reason: "   too short to count   " }).expect(400);
        const tooLong = await admin.put(`/users/${carol}/state`).send({ state: "Suspended", reason: "x".repeat(501) }).expect(400);
        const badState = await admin.put(`/users/${carol}/state`).send({ state: "Deleted", reason: REASON }).expect(400);

        expect(tooShort.body.error.details.fields.reason).toEqual(["must be between 20 and 500 characters"]);
        expect(tooLong.body.error.details.fields.reason).toEqual(["must be between 20 and 500 characters"]);
        expect(badState.body.error.details.fields.state).toEqual(["must be Active or Suspended"]);
        const stored = await UserModel.findById(carol).select("+stateChanges");
        expect(stored).toMatchObject({ state: "Active", stateChanges: [] });
    });

    it("refuses a change that does not fit the current state", async () => {
        await createUser({ username: "admin", roles: [...ADMIN_ROLES] });
        const pending = await createUser({ username: "pat", state: "PendingVerification" });
        const active = await createUser({ username: "carol" });
        const suspended = await createUser({ username: "sam", state: "Suspended" });
        const admin = await loginAs("admin");

        const unverified = await admin.put(`/users/${pending}/state`).send({ state: "Suspended", reason: REASON }).expect(409);
        await admin.put(`/users/${pending}/state`).send({ state: "Active", reason: REASON }).expect(409);
        const again = await admin.put(`/users/${suspended}/state`).send({ state: "Suspended", reason: REASON }).expect(409);
        const notSuspended = await admin.put(`/users/${active}/state`).send({ state: "Active", reason: REASON }).expect(409);

        expect(unverified.body.error).toMatchObject({ code: "INVALID_STATE_CHANGE", message: "Only an Active account can be suspended" });
        expect(again.body.error.code).toBe("INVALID_STATE_CHANGE");
        expect(notSuspended.body.error.message).toBe("Only a Suspended account can be reinstated");
        expect(await UserModel.findById(pending)).toMatchObject({ state: "PendingVerification" });
    });

    it("refuses members, unknown accounts and the administrator's own account", async () => {
        const adminId = await createUser({ username: "admin", roles: [...ADMIN_ROLES] });
        const carol = await createUser({ username: "carol" });
        const admin = await loginAs("admin");
        const member = await loginAs("carol");

        await member.put(`/users/${adminId}/state`).send({ state: "Suspended", reason: REASON }).expect(403);
        const unknown = await admin.put(`/users/${randomUUID()}/state`).send({ state: "Suspended", reason: REASON }).expect(404);
        const own = await admin.put(`/users/${adminId}/state`).send({ state: "Suspended", reason: REASON }).expect(409);

        expect(unknown.body.error.code).toBe("USER_NOT_FOUND");
        expect(own.body.error.code).toBe("OWN_ACCOUNT");
        expect(await UserModel.findById(carol)).toMatchObject({ state: "Active" });
    });

    it("keeps an Active administrator when two suspend each other at the same moment", async () => {
        const first = await createUser({ username: "first", roles: [...ADMIN_ROLES] });
        const second = await createUser({ username: "second", roles: [...ADMIN_ROLES] });
        const firstAgent = await loginAs("first");
        const secondAgent = await loginAs("second");

        await Promise.all([
            firstAgent.put(`/users/${second}/state`).send({ state: "Suspended", reason: REASON }),
            secondAgent.put(`/users/${first}/state`).send({ state: "Suspended", reason: REASON }),
        ]);

        expect(await UserModel.countDocuments({ roles: "administrator", state: "Active" })).toBeGreaterThanOrEqual(1);
        // An undone suspension leaves no entry behind, so the history always ends in the current state
        for (const user of await UserModel.find().select("+stateChanges")) {
            expect(user.stateChanges.at(-1)?.to ?? "Active").toBe(user.state);
        }
    });
});

describe("sessions of a suspended account (F1.6.8)", () => {
    const REASON = "Harassed a courier in the errand chat";

    it("all end when the account is suspended, and no new one starts", async () => {
        const adminId = await createUser({ username: "admin", roles: [...ADMIN_ROLES] });
        const carol = await createUser({ username: "carol" });
        const admin = await loginAs("admin");
        const phone = await loginAs("carol");
        const login = await request(app).post("/auth/login").send({ identifier: "carol", password: PASSWORD }).expect(200);

        await admin.put(`/users/${carol}/state`).send({ state: "Suspended", reason: REASON }).expect(200);

        expect(await SessionModel.countDocuments({ accountId: carol })).toBe(0);
        expect(await SessionModel.countDocuments({ accountId: adminId })).toBe(1);
        await phone.get("/users/me").expect(401);
        const decision = await request(app).post("/internal/authorize").send({ token: sessionTokenOf(login) }).expect(200);
        expect(decision.body).toEqual({ decision: "denied" });
        const refused = await request(app).post("/auth/login").send({ identifier: "carol", password: PASSWORD }).expect(403);
        expect(refused.body.error.code).toBe("ACCOUNT_SUSPENDED");
    });

    it("stay ended after a reinstatement, while a new login works", async () => {
        await createUser({ username: "admin", roles: [...ADMIN_ROLES] });
        const carol = await createUser({ username: "carol" });
        const admin = await loginAs("admin");
        const phone = await loginAs("carol");

        await admin.put(`/users/${carol}/state`).send({ state: "Suspended", reason: REASON }).expect(200);
        await admin.put(`/users/${carol}/state`).send({ state: "Active", reason: "Apologised to the courier, first warning" }).expect(200);

        await phone.get("/users/me").expect(401);
        const laptop = await loginAs("carol");
        await laptop.get("/users/me").expect(200);
    });
});
