import request from "supertest";
import { describe, expect, it } from "vitest";
import { ensureAdministrator } from "../src/bootstrap.ts";
import { SessionModel } from "../src/models/session.model.ts";
import { UserModel } from "../src/models/user.model.ts";
import { useTestDatabase } from "./helpers/db.ts";
import { app, createUser, loginAs, PASSWORD, sessionTokenOf } from "./helpers/users.ts";

useTestDatabase();

const ADMIN_ROLES = ["member", "administrator"] as const;

describe("role checks", () => {
    it("refuses members the same way whether or not the account exists (N1.1.1, F1.5.4)", async () => {
        await createUser({ username: "alice" });
        const carol = await createUser({ username: "carol" });
        const member = await loginAs("alice");

        const existing = await member.get(`/users/${carol}`).expect(403);
        const missing = await member.get("/users/does-not-exist").expect(403);

        expect(existing.body).toEqual(missing.body);
        await member.get("/users").expect(403);
        await member.delete(`/users/${carol}`).expect(403);
        await member.put(`/users/${carol}/roles/administrator`).expect(403);
    });

    it("lets administrators list, read, edit and delete accounts (F1.4.1, F1.4.2, F1.4.4)", async () => {
        await createUser({ username: "admin", roles: [...ADMIN_ROLES] });
        const carol = await createUser({ username: "carol" });
        const admin = await loginAs("admin");

        const list = await admin.get("/users?pageSize=1").expect(200);
        expect(list.body).toMatchObject({ page: 1, pageSize: 1, total: 2 });

        await admin.get(`/users/${carol}`).expect(200);
        await admin.patch(`/users/${carol}`).send({ fullName: "Carol Lim" }).expect(200);
        await admin.delete(`/users/${carol}`).expect(204);
        await admin.get(`/users/${carol}`).expect(404);
    });

    it("lets a member be requester and courier without another role (F1.5.2)", async () => {
        await createUser({ username: "alice" });
        const member = await loginAs("alice");

        const me = await member.get("/users/me").expect(200);
        expect(me.body.roles).toEqual(["member"]);
    });
});

describe("profile updates", () => {
    it("let account holders change their name and username, not email or roles (F1.4.3)", async () => {
        await createUser({ username: "alice" });
        const member = await loginAs("alice");

        await member.patch("/users/me").send({ fullName: "Alice Tan", username: "alice_t" }).expect(200);
        const refused = await member.patch("/users/me").send({ email: "x@u.nus.edu", roles: ["administrator"] }).expect(400);

        expect(refused.body.error.code).toBe("VALIDATION_FAILED");
        const stored = await UserModel.findOne({ username: "alice_t" });
        expect(stored).toMatchObject({ fullName: "Alice Tan", email: "alice@u.nus.edu", roles: ["member"] });
    });

    it("apply the registration rules to a new username (F1.4.2)", async () => {
        await createUser({ username: "alice" });
        await createUser({ username: "carol" });
        const member = await loginAs("alice");

        const taken = await member.patch("/users/me").send({ username: "CAROL" }).expect(400);
        expect(taken.body.error.details.fields.username).toEqual(["is already in use"]);
        await member.patch("/users/me").send({ username: "a" }).expect(400);
    });
});

describe("administrator role", () => {
    it("can be granted and revoked only by an administrator (F1.5.5)", async () => {
        await createUser({ username: "admin", roles: [...ADMIN_ROLES] });
        const carol = await createUser({ username: "carol" });
        const admin = await loginAs("admin");

        const granted = await admin.put(`/users/${carol}/roles/administrator`).expect(200);
        expect(granted.body.roles).toContain("administrator");

        const revoked = await admin.delete(`/users/${carol}/roles/administrator`).expect(200);
        expect(revoked.body.roles).not.toContain("administrator");
    });

    it("cannot be revoked from, or deleted with, the last administrator (F1.5.5)", async () => {
        const adminId = await createUser({ username: "admin", roles: [...ADMIN_ROLES] });
        const admin = await loginAs("admin");

        const revoke = await admin.delete(`/users/${adminId}/roles/administrator`).expect(409);
        const remove = await admin.delete(`/users/${adminId}`).expect(409);

        expect(revoke.body.error.code).toBe("LAST_ADMINISTRATOR");
        expect(remove.body.error.code).toBe("LAST_ADMINISTRATOR");
        expect(await UserModel.countDocuments({ roles: "administrator" })).toBe(1);
    });

    it("keeps an administrator when two revoke each other at the same moment (F1.5.5)", async () => {
        const first = await createUser({ username: "first", roles: [...ADMIN_ROLES] });
        const second = await createUser({ username: "second", roles: [...ADMIN_ROLES] });
        const firstAgent = await loginAs("first");
        const secondAgent = await loginAs("second");

        await Promise.all([
            firstAgent.delete(`/users/${second}/roles/administrator`),
            secondAgent.delete(`/users/${first}/roles/administrator`),
        ]);

        expect(await UserModel.countDocuments({ roles: "administrator" })).toBeGreaterThanOrEqual(1);
    });
});

describe("POST /internal/authorize (F1.5.3)", () => {
    async function tokenFor(username: string): Promise<string> {
        const response = await request(app).post("/auth/login").send({ identifier: username, password: PASSWORD });
        return sessionTokenOf(response);
    }

    function authorize(token: string, requiredRole?: string) {
        return request(app).post("/internal/authorize").send({ token, requiredRole }).expect(200);
    }

    it("authorizes an Active account that holds the required role", async () => {
        const id = await createUser({ username: "admin", roles: [...ADMIN_ROLES] });
        const response = await authorize(await tokenFor("admin"), "administrator");

        expect(response.body).toEqual({ decision: "authorized", accountId: id, roles: [...ADMIN_ROLES] });
    });

    it("defaults to the member role", async () => {
        await createUser({ username: "alice" });
        const response = await authorize(await tokenFor("alice"));
        expect(response.body.decision).toBe("authorized");
    });

    it("denies a missing role, an unknown token and an inactive account", async () => {
        await createUser({ username: "alice" });
        const token = await tokenFor("alice");

        expect((await authorize(token, "administrator")).body).toEqual({ decision: "denied" });
        expect((await authorize("made-up-token")).body).toEqual({ decision: "denied" });

        await UserModel.updateOne({ username: "alice" }, { $set: { state: "Suspended" } });
        expect((await authorize(token)).body).toEqual({ decision: "denied" });
    });

    it("changes no data when it denies", async () => {
        await createUser({ username: "alice" });
        const token = await tokenFor("alice");
        await UserModel.updateOne({ username: "alice" }, { $set: { state: "Suspended" } });
        const before = await SessionModel.find().lean();

        await authorize(token);

        expect(await SessionModel.find().lean()).toEqual(before);
    });

    it("applies a role change on the next request", async () => {
        await createUser({ username: "alice" });
        const token = await tokenFor("alice");

        await UserModel.updateOne({ username: "alice" }, { $addToSet: { roles: "administrator" } });

        expect((await authorize(token, "administrator")).body.decision).toBe("authorized");
    });
});

describe("first administrator (F1.5.6)", () => {
    it("is created from the environment when none exists, and only once", async () => {
        await ensureAdministrator();
        await ensureAdministrator();

        const admins = await UserModel.find({ roles: "administrator" });
        expect(admins).toHaveLength(1);
        expect(admins[0]).toMatchObject({ email: "admin@nus.edu.sg", state: "Active" });
        await request(app).post("/auth/login").send({ identifier: "admin", password: "admin-password" }).expect(200);
    });

    it("is announced to the Credit Service like any other Active account (F1.1.7)", async () => {
        await ensureAdministrator();

        const admin = await UserModel.findOne({ roles: "administrator" }).select("+announcement");
        expect(admin?.announcement?.pending).toBe(true);
    });

    it("is not created when an administrator already exists", async () => {
        await createUser({ username: "boss", roles: [...ADMIN_ROLES] });
        await ensureAdministrator();
        expect(await UserModel.countDocuments({ roles: "administrator" })).toBe(1);
    });
});