import request from "supertest";
import { describe, expect, it } from "vitest";
import { SessionModel } from "../src/models/session.model.ts";
import { UserModel } from "../src/models/user.model.ts";
import { useTestDatabase } from "./helpers/db.ts";
import { app, createUser, loginAs, PASSWORD } from "./helpers/users.ts";

useTestDatabase();

const DAY = 24 * 60 * 60 * 1000;

describe("sessions", () => {
    it("treats a request without a valid session as unauthenticated (F1.3.3)", async () => {
        await request(app).get("/users/me").expect(401);
        await request(app).get("/users/me").set("Cookie", "relay_session=made-up").expect(401);
    });

    it("identifies the account behind a valid session", async () => {
        await createUser();
        const agent = await loginAs("alice");

        const response = await agent.get("/users/me").expect(200);
        expect(response.body.username).toBe("alice");
    });

    it("ends after 7 days without use (N1.3)", async () => {
        await createUser();
        const agent = await loginAs("alice");
        await SessionModel.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });

        await agent.get("/users/me").expect(401);
    });

    it("never extends past 30 days, however active the user is (N1.3)", async () => {
        await createUser();
        const agent = await loginAs("alice");
        await SessionModel.updateMany({}, {
            $set: { createdAt: new Date(Date.now() - 29.5 * DAY), lastSeenAt: new Date(Date.now() - 2 * 60_000) },
        });

        await agent.get("/users/me").expect(200);

        const session = await SessionModel.findOne();
        const remaining = session!.expiresAt.getTime() - Date.now();
        expect(remaining).toBeLessThanOrEqual(0.5 * DAY);
    });

    it("stops working when the account is no longer Active", async () => {
        await createUser();
        const agent = await loginAs("alice");
        await UserModel.updateOne({ username: "alice" }, { $set: { state: "Suspended" } });

        await agent.get("/users/me").expect(401);
    });

    it("ends on logout", async () => {
        await createUser();
        const agent = await loginAs("alice");

        await agent.post("/auth/logout").expect(204);

        await agent.get("/users/me").expect(401);
        expect(await SessionModel.countDocuments()).toBe(0);
    });

    it("ends every other session when the password changes (F1.4.3)", async () => {
        await createUser();
        const current = await loginAs("alice");
        const other = await loginAs("alice");

        await current
            .put("/users/me/password")
            .send({ currentPassword: PASSWORD, newPassword: "a-brand-new-password" })
            .expect(204);

        await current.get("/users/me").expect(200);
        await other.get("/users/me").expect(401);
        await request(app).post("/auth/login").send({ identifier: "alice", password: PASSWORD }).expect(401);
    });

    it("refuses a password change with a wrong current password", async () => {
        await createUser();
        const agent = await loginAs("alice");

        const response = await agent
            .put("/users/me/password")
            .send({ currentPassword: "wrong-password", newPassword: "a-brand-new-password" })
            .expect(400);
        expect(response.body.error.details.fields.currentPassword).toBeDefined();
    });
});