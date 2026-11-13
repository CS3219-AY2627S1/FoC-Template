import request from "supertest";
import { describe, expect, it } from "vitest";
import { SessionModel } from "../src/models/session.model.ts";
import { useTestDatabase } from "./helpers/db.ts";
import { app, createUser, PASSWORD, sessionTokenOf } from "./helpers/users.ts";

useTestDatabase();

function login(identifier: string, password: string) {
    return request(app).post("/auth/login").send({ identifier, password });
}

describe("POST /auth/login", () => {
    it("accepts the username in any case or the email address (F1.3.1)", async () => {
        await createUser({ username: "Alice" });

        await login("alice", PASSWORD).expect(200);
        await login("ALICE@U.NUS.EDU", PASSWORD).expect(200);
    });

    it("sets an HttpOnly session cookie and keeps the token out of the body (N1.2.1)", async () => {
        await createUser();

        const response = await login("alice", PASSWORD).expect(200);
        const token = sessionTokenOf(response);

        expect(token).toHaveLength(43);
        expect(String(response.headers["set-cookie"])).toMatch(/HttpOnly/);
        expect(JSON.stringify(response.body)).not.toContain(token);
    });

    it("stores only a hash of the session token", async () => {
        await createUser();
        const token = sessionTokenOf(await login("alice", PASSWORD));

        expect(await SessionModel.countDocuments({ _id: token })).toBe(0);
        expect(await SessionModel.countDocuments()).toBe(1);
    });

    it("gives one identical answer for an unknown user and a wrong password (F1.3.2)", async () => {
        await createUser();

        const wrongPassword = await login("alice", "wrong-password").expect(401);
        const unknownUser = await login("nobody", "wrong-password").expect(401);

        expect(wrongPassword.body).toEqual(unknownUser.body);
        expect(wrongPassword.headers["set-cookie"]).toBeUndefined();
    });

    it("refuses accounts that are not Active, but only after a correct password (F1.3.4)", async () => {
        await createUser({ username: "pending", state: "PendingVerification" });
        await createUser({ username: "suspended", state: "Suspended" });

        expect((await login("pending", PASSWORD).expect(403)).body.error.code).toBe("ACCOUNT_NOT_VERIFIED");
        expect((await login("suspended", PASSWORD).expect(403)).body.error.code).toBe("ACCOUNT_SUSPENDED");
        expect((await login("pending", "wrong-password").expect(401)).body.error.code).toBe("INVALID_CREDENTIALS");
        expect(await SessionModel.countDocuments()).toBe(0);
    });
});