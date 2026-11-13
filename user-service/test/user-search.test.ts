import { describe, expect, it } from "vitest";
import { UserModel } from "../src/models/user.model.ts";
import { useTestDatabase } from "./helpers/db.ts";
import { createUser, loginAs } from "./helpers/users.ts";

useTestDatabase();

// Usernames of the accounts in a list answer, sorted, since accounts created in the same
// millisecond have no fixed order.
function usernamesOf(body: { items: { username: string }[] }): string[] {
    return body.items.map((user) => user.username).sort();
}

async function adminWithAccounts() {
    await createUser({ username: "admin", roles: ["member", "administrator"] });
    const carol = await createUser({ username: "carol" });
    await createUser({ username: "dave", state: "Suspended" });
    await createUser({ username: "erin", state: "PendingVerification" });
    await UserModel.updateOne({ _id: carol }, { $set: { fullName: "Carol Lim" } });
    return { admin: await loginAs("admin"), carol };
}

describe("account search (F5.5.1)", () => {
    it("finds part of a full name, username or email address, ignoring case", async () => {
        const { admin } = await adminWithAccounts();

        const byName = await admin.get("/users").query({ q: "LIM" }).expect(200);
        const byUsername = await admin.get("/users").query({ q: "Dav" }).expect(200);
        const byEmail = await admin.get("/users").query({ q: "erin@u.nus" }).expect(200);

        expect(usernamesOf(byName.body)).toEqual(["carol"]);
        expect(usernamesOf(byUsername.body)).toEqual(["dave"]);
        expect(usernamesOf(byEmail.body)).toEqual(["erin"]);
        expect(byName.body.total).toBe(1);
    });

    it("finds an account by its exact id", async () => {
        const { admin, carol } = await adminWithAccounts();

        const response = await admin.get("/users").query({ q: carol }).expect(200);

        expect(response.body.items).toMatchObject([{ id: carol }]);
    });

    it("treats the search as plain text, not as a pattern", async () => {
        const { admin } = await adminWithAccounts();

        const wildcard = await admin.get("/users").query({ q: ".*" }).expect(200);
        const broken = await admin.get("/users").query({ q: "carol(" }).expect(200);

        expect(wildcard.body.total).toBe(0);
        expect(broken.body.total).toBe(0);
    });

    it("filters by state, also together with a search", async () => {
        const { admin } = await adminWithAccounts();

        const suspended = await admin.get("/users").query({ state: "Suspended" }).expect(200);
        const activeDave = await admin.get("/users").query({ state: "Active", q: "dave" }).expect(200);
        const unknown = await admin.get("/users").query({ state: "Deleted" }).expect(400);

        expect(usernamesOf(suspended.body)).toEqual(["dave"]);
        expect(activeDave.body.total).toBe(0);
        expect(unknown.body.error.details.fields.state).toEqual(["must be PendingVerification, Active or Suspended"]);
    });

    it("counts only the matches and pages through them", async () => {
        const { admin } = await adminWithAccounts();

        const all = await admin.get("/users").query({ q: "" }).expect(200);
        const secondPage = await admin.get("/users").query({ state: "Active", pageSize: 1, page: 2 }).expect(200);

        expect(all.body.total).toBe(4);
        expect(secondPage.body).toMatchObject({ page: 2, pageSize: 1, total: 2 });
        expect(secondPage.body.items).toHaveLength(1);
    });
});
