import request from "supertest";
import { describe, expect, it } from "vitest";
import { DEMO_STUDENTS, seedDemoStudents } from "../src/bootstrap.ts";
import { UserModel } from "../src/models/user.model.ts";
import { useTestDatabase } from "./helpers/db.ts";
import { app, createUser } from "./helpers/users.ts";

useTestDatabase();

const DEMO_PASSWORD = "demo-password";

describe("demo students for the final demo", () => {
    it("are created Active, announced to the credit-service and can log in", async () => {
        expect(await seedDemoStudents(DEMO_PASSWORD)).toBe(DEMO_STUDENTS.length);

        const students = await UserModel.find({ email: { $in: DEMO_STUDENTS.map((s) => s.email) } }).select("+announcement");
        expect(students).toHaveLength(DEMO_STUDENTS.length);
        for (const student of students) {
            expect(student).toMatchObject({ state: "Active", roles: ["member"] });
            expect(student.announcement?.pending).toBe(true);
        }
        for (const { username, email } of DEMO_STUDENTS) {
            await request(app).post("/auth/login").send({ identifier: username, password: DEMO_PASSWORD }).expect(200);
            await request(app).post("/auth/login").send({ identifier: email, password: DEMO_PASSWORD }).expect(200);
        }
    });

    it("are created only once, also when several instances seed at the same time", async () => {
        const results = await Promise.all([seedDemoStudents(DEMO_PASSWORD), seedDemoStudents(DEMO_PASSWORD)]);
        expect(results.reduce((sum, created) => sum + created, 0)).toBe(DEMO_STUDENTS.length);

        expect(await seedDemoStudents("another-password")).toBe(0);
        expect(await UserModel.countDocuments()).toBe(DEMO_STUDENTS.length);
        // A later start with another password does not change the password of an existing account.
        await request(app).post("/auth/login").send({ identifier: "alice.tan", password: DEMO_PASSWORD }).expect(200);
        await request(app).post("/auth/login").send({ identifier: "alice.tan", password: "another-password" }).expect(401);
    });

    it("leave an account that already uses one of the addresses as it is", async () => {
        const existing = await createUser({ username: "alice.tan", state: "Suspended" });

        expect(await seedDemoStudents(DEMO_PASSWORD)).toBe(DEMO_STUDENTS.length - 1);

        expect((await UserModel.findById(existing))?.state).toBe("Suspended");
        expect(await UserModel.countDocuments({ email: "alice.tan@u.nus.edu" })).toBe(1);
        await request(app).post("/auth/login").send({ identifier: "ben.lim", password: DEMO_PASSWORD }).expect(200);
    });
});
