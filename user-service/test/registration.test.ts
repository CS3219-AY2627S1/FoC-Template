import request from "supertest";
import { describe, expect, it } from "vitest";
import { UserModel } from "../src/models/user.model.ts";
import { useTestDatabase } from "./helpers/db.ts";
import { app, createUser, lastCodeSentTo } from "./helpers/users.ts";

useTestDatabase();

const valid = {
    fullName: "Alice Tan",
    email: "alice@u.nus.edu",
    username: "alice",
    password: "long-enough-password",
};

describe("POST /auth/register", () => {
    it("creates a pending member account and never returns the password (F1.1.1, F1.5.1, N1.2.1)", async () => {
        const response = await request(app).post("/auth/register").send(valid).expect(201);

        expect(response.body).toMatchObject({ username: "alice", roles: ["member"], state: "PendingVerification" });
        expect(response.body.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(JSON.stringify(response.body)).not.toContain(valid.password);
        expect(response.body).not.toHaveProperty("passwordHash");
    });

    it("stores only an argon2 hash of the password (N1.2.1)", async () => {
        await request(app).post("/auth/register").send(valid).expect(201);

        const stored = await UserModel.findOne({ username: "alice" }).select("+passwordHash");
        expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);
    });

    it("sends a verification code to the new address (F1.1.4)", async () => {
        await request(app).post("/auth/register").send(valid).expect(201);
        expect(lastCodeSentTo("alice@u.nus.edu")).toMatch(/^\d{6}$/);
    });

    it("names every invalid field at once (F1.1.3)", async () => {
        const response = await request(app)
            .post("/auth/register")
            .send({ email: "alice@gmail.com", username: "a", password: "short" })
            .expect(400);

        expect(Object.keys(response.body.error.details.fields).sort()).toEqual([
            "email",
            "fullName",
            "password",
            "username",
        ]);
    });

    it("rejects addresses outside NUS (F1.1.6)", async () => {
        const response = await request(app)
            .post("/auth/register")
            .send({ ...valid, email: "alice@gmail.com" })
            .expect(400);
        expect(response.body.error.details.fields.email).toBeDefined();
    });

    it("reports taken email and username together with other invalid fields (F1.1.3)", async () => {
        await createUser({ username: "alice" });

        const response = await request(app)
            .post("/auth/register")
            .send({ ...valid, username: "ALICE", password: "short" })
            .expect(400);

        expect(response.body.error.details.fields).toMatchObject({
            email: ["is already in use"],
            username: ["is already in use"],
            password: ["must be at least 8 characters"],
        });
    });

    it("ignores fields a client must not set", async () => {
        const response = await request(app)
            .post("/auth/register")
            .send({ ...valid, roles: ["administrator"], state: "Active" })
            .expect(201);

        expect(response.body).toMatchObject({ roles: ["member"], state: "PendingVerification" });
    });

    it("creates only one account when the same registration arrives twice at once", async () => {
        const results = await Promise.all([
            request(app).post("/auth/register").send(valid),
            request(app).post("/auth/register").send(valid),
            request(app).post("/auth/register").send(valid),
        ]);

        expect(results.map((r) => r.status).sort()).toEqual([201, 400, 400]);
        expect(await UserModel.countDocuments()).toBe(1);
    });
});