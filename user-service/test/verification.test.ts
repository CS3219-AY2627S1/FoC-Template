import request from "supertest";
import { describe, expect, it } from "vitest";
import { UserModel } from "../src/models/user.model.ts";
import { useTestDatabase } from "./helpers/db.ts";
import { app, lastCodeSentTo } from "./helpers/users.ts";

useTestDatabase();

const email = "bob@u.nus.edu";

async function register(): Promise<string> {
    await request(app)
        .post("/auth/register")
        .send({ fullName: "Bob", email, username: "bob", password: "long-enough-password" })
        .expect(201);
    return lastCodeSentTo(email);
}

function verify(code: string) {
    return request(app).post("/auth/verify").send({ email, code });
}

function wrong(code: string): string {
    return code === "000000" ? "111111" : "000000";
}

describe("POST /auth/verify", () => {
    it("activates the account with the correct code (F1.1.5)", async () => {
        const code = await register();

        const response = await verify(code).expect(200);

        expect(response.body.state).toBe("Active");
        const stored = await UserModel.findOne({ email }).select("+otp");
        expect(stored?.otp).toBeUndefined();
    });

    it("rejects a wrong code and counts down the attempts (F1.1.8)", async () => {
        const code = await register();

        const first = await verify(wrong(code)).expect(400);
        const second = await verify(wrong(code)).expect(400);

        expect(first.body.error).toMatchObject({ code: "CODE_INVALID", details: { attemptsLeft: 4 } });
        expect(second.body.error.details.attemptsLeft).toBe(3);
    });

    it("locks the code after 5 wrong entries, even when they arrive at once (F1.1.4)", async () => {
        const code = await register();

        const results = await Promise.all(Array.from({ length: 8 }, () => verify(wrong(code))));
        const codes = results.map((r) => r.body.error.code);

        expect(codes.filter((c) => c === "CODE_INVALID")).toHaveLength(5);
        expect(codes.filter((c) => c === "TOO_MANY_ATTEMPTS")).toHaveLength(3);
        await verify(code).expect(400);
    });

    it("rejects an expired code naming the reason (F1.1.8)", async () => {
        const code = await register();
        await UserModel.updateOne({ email }, { $set: { "otp.expiresAt": new Date(Date.now() - 1000) } });

        const response = await verify(code).expect(400);
        expect(response.body.error.code).toBe("CODE_EXPIRED");
    });

    it("rejects a code that is not 6 digits", async () => {
        await register();
        const response = await verify("12ab").expect(400);
        expect(response.body.error.details.fields.code).toBeDefined();
    });
});

describe("POST /auth/verify/resend", () => {
    it("replaces the code, so the previous one stops working (F1.1.9)", async () => {
        const oldCode = await register();
        await UserModel.updateOne({ email }, { $set: { "otp.sentAt": new Date(Date.now() - 120_000) } });

        await request(app).post("/auth/verify/resend").send({ email }).expect(202);
        const newCode = lastCodeSentTo(email);

        if (newCode !== oldCode) await verify(oldCode).expect(400);
        await verify(newCode).expect(200);
    });

    it("sends no new code within the cooldown", async () => {
        await register();
        const before = await UserModel.findOne({ email }).select("+otp");

        await request(app).post("/auth/verify/resend").send({ email }).expect(202);

        const after = await UserModel.findOne({ email }).select("+otp");
        expect(after?.otp?.codeHash).toBe(before?.otp?.codeHash);
    });

    it("answers the same for an unknown address", async () => {
        const response = await request(app).post("/auth/verify/resend").send({ email: "nobody@u.nus.edu" }).expect(202);
        expect(response.body.message).toBeDefined();
    });
});

describe("unverified accounts", () => {
    it("are covered by a TTL index that only matches pending accounts (F1.1.10)", async () => {
        const indexes = await UserModel.collection.indexes();
        const ttl = indexes.find((index) => index.expireAfterSeconds !== undefined);

        expect(ttl).toMatchObject({
            key: { createdAt: 1 },
            expireAfterSeconds: 24 * 60 * 60,
            partialFilterExpression: { state: "PendingVerification" },
        });
    });
});