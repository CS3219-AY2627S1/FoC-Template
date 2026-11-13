import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportModel, type ReportState } from "../src/models/report.model.ts";
import { SessionModel } from "../src/models/session.model.ts";
import { UserModel, type AccountState } from "../src/models/user.model.ts";
import { useTestDatabase } from "./helpers/db.ts";
import { app, createUser, loginAs } from "./helpers/users.ts";

useTestDatabase();

const REASON = "Took the food and never delivered it";

// The order-service is replaced by the errands a test registers; anything else is unknown there.
const errands = new Map<string, { requesterId: string; courierId: string | null }>();
const orderService = vi.fn(async (url: string | URL) => {
    const id = decodeURIComponent(new URL(String(url)).pathname.replace("/internal/orders/", ""));
    const errand = errands.get(id);
    return errand
        ? Response.json({ id, status: "Delivered", ...errand })
        : Response.json({ error: "ORDER_NOT_FOUND" }, { status: 404 });
});

function errand(id: string, requesterId: string, courierId: string | null) {
    errands.set(id, { requesterId, courierId });
}

beforeEach(() => {
    errands.clear();
    orderService.mockClear();
    vi.stubGlobal("fetch", orderService);
});
afterEach(() => vi.unstubAllGlobals());

describe("POST /reports (F1.6.3)", () => {
    it("files a report on another account and errand as Open", async () => {
        const alice = await createUser({ username: "alice" });
        const bob = await createUser({ username: "bob" });
        errand("42", alice, bob);
        const member = await loginAs("alice");
        const before = Date.now();

        const response = await member.post("/reports").send({ reportedId: bob, errandId: " 42 ", reason: `  ${REASON}  ` }).expect(201);

        expect(response.body).toMatchObject({ id: expect.any(String), reportedId: bob, errandId: "42", reason: REASON, state: "Open" });
        expect(Date.parse(response.body.filedAt)).toBeGreaterThanOrEqual(before);
        // F1.6.5: the stored report also knows who filed it, and has no decision yet
        const stored = await ReportModel.findById(response.body.id);
        expect(stored).toMatchObject({ reporterId: alice, reportedId: bob, errandId: "42", state: "Open" });
        expect(stored?.decision).toBeUndefined();
    });

    it("needs a session", async () => {
        const bob = await createUser({ username: "bob" });

        await request(app).post("/reports").send({ reportedId: bob, errandId: "42", reason: REASON }).expect(401);

        expect(await ReportModel.countDocuments()).toBe(0);
    });

    it("lets the same reporter report the same account again on another errand", async () => {
        const alice = await createUser({ username: "alice" });
        const bob = await createUser({ username: "bob" });
        errand("42", alice, bob);
        errand("43", bob, alice);
        const member = await loginAs("alice");

        await member.post("/reports").send({ reportedId: bob, errandId: "42", reason: REASON }).expect(201);
        await member.post("/reports").send({ reportedId: bob, errandId: "43", reason: REASON }).expect(201);

        expect(await ReportModel.countDocuments()).toBe(2);
    });
});

describe("refused reports (F1.6.4)", () => {
    it("name a reason outside 20 to 500 characters and every missing field", async () => {
        await createUser({ username: "alice" });
        const bob = await createUser({ username: "bob" });
        const member = await loginAs("alice");

        const tooShort = await member.post("/reports").send({ reportedId: bob, errandId: "42", reason: "He was rude to me" }).expect(400);
        const tooLong = await member.post("/reports").send({ reportedId: bob, errandId: "42", reason: "x".repeat(501) }).expect(400);
        const empty = await member.post("/reports").send({}).expect(400);

        expect(tooShort.body.error.details.fields.reason).toEqual(["must be between 20 and 500 characters"]);
        expect(tooLong.body.error.details.fields.reason).toEqual(["must be between 20 and 500 characters"]);
        expect(empty.body.error.details.fields).toEqual({
            reportedId: ["is required"],
            errandId: ["is required"],
            reason: ["is required"],
        });
        expect(await ReportModel.countDocuments()).toBe(0);
    });

    it("name a report on the reporter's own account or on an unknown one", async () => {
        const alice = await createUser({ username: "alice" });
        const member = await loginAs("alice");

        const own = await member.post("/reports").send({ reportedId: alice, errandId: "42", reason: REASON }).expect(400);
        const unknown = await member.post("/reports").send({ reportedId: randomUUID(), errandId: "42", reason: REASON }).expect(400);

        expect(own.body.error.details.fields.reportedId).toEqual(["cannot be your own account"]);
        expect(unknown.body.error.details.fields.reportedId).toEqual(["does not exist"]);
        expect(await ReportModel.countDocuments()).toBe(0);
    });

    it("name a second report by the same reporter on the same errand, even sent at once", async () => {
        const alice = await createUser({ username: "alice" });
        const bob = await createUser({ username: "bob" });
        errand("42", alice, bob);
        const member = await loginAs("alice");

        const results = await Promise.all([
            member.post("/reports").send({ reportedId: bob, errandId: "42", reason: REASON }),
            member.post("/reports").send({ reportedId: bob, errandId: "42", reason: REASON }),
        ]);

        expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
        const refused = results.find((r) => r.status === 400)!;
        expect(refused.body.error.details.fields.errandId).toEqual(["has already been reported by you"]);
        expect(await ReportModel.countDocuments()).toBe(1);
    });

    it("do not stop the other participant from reporting on the same errand", async () => {
        const aliceId = await createUser({ username: "alice" });
        const bobId = await createUser({ username: "bob" });
        errand("42", aliceId, bobId);
        const alice = await loginAs("alice");
        const bob = await loginAs("bob");

        await alice.post("/reports").send({ reportedId: bobId, errandId: "42", reason: REASON }).expect(201);
        await bob.post("/reports").send({ reportedId: aliceId, errandId: "42", reason: REASON }).expect(201);

        expect(await ReportModel.countDocuments()).toBe(2);
    });
});

describe("reports checked against the errand (F1.6.3)", () => {
    it("ask the order-service for the errand named in the report", async () => {
        const alice = await createUser({ username: "alice" });
        const bob = await createUser({ username: "bob" });
        errand("42", bob, alice);
        const member = await loginAs("alice");

        await member.post("/reports").send({ reportedId: bob, errandId: "42", reason: REASON }).expect(201);

        expect(orderService).toHaveBeenCalledOnce();
        expect(String(orderService.mock.lastCall?.[0])).toBe("http://localhost:3003/internal/orders/42");
    });

    it("name an errand the order-service does not know", async () => {
        await createUser({ username: "alice" });
        const bob = await createUser({ username: "bob" });
        const member = await loginAs("alice");

        const response = await member.post("/reports").send({ reportedId: bob, errandId: "404", reason: REASON }).expect(400);

        expect(response.body.error.details.fields.errandId).toEqual(["does not exist"]);
        expect(await ReportModel.countDocuments()).toBe(0);
    });

    it("name an errand on which the two accounts were not requester and courier", async () => {
        const alice = await createUser({ username: "alice" });
        const bob = await createUser({ username: "bob" });
        const carol = await createUser({ username: "carol" });
        errand("41", alice, carol);
        errand("42", carol, bob);
        errand("43", alice, null);
        const member = await loginAs("alice");

        for (const errandId of ["41", "42", "43"]) {
            const response = await member.post("/reports").send({ reportedId: bob, errandId, reason: REASON }).expect(400);
            expect(response.body.error.details.fields.errandId).toEqual(["is not an errand between you and this account"]);
        }
        expect(await ReportModel.countDocuments()).toBe(0);
    });

    it("are refused with 503 when the order-service is down, slow or answers nonsense", async () => {
        const alice = await createUser({ username: "alice" });
        const bob = await createUser({ username: "bob" });
        errand("42", alice, bob);
        const member = await loginAs("alice");

        for (const failure of [
            async () => { throw new TypeError("fetch failed"); },
            async () => { throw new DOMException("The operation timed out", "TimeoutError"); },
            async () => new Response("Bad gateway", { status: 502 }),
            async () => Response.json({ id: "42" }),
        ]) {
            orderService.mockImplementationOnce(failure);
            const response = await member.post("/reports").send({ reportedId: bob, errandId: "42", reason: REASON }).expect(503);
            expect(response.body.error.code).toBe("ORDER_SERVICE_UNAVAILABLE");
        }
        expect(await ReportModel.countDocuments()).toBe(0);
    });
});

describe("reports for administrators (F1.6.5, F5.5.4)", () => {
    const ADMIN_ROLES = ["member", "administrator"] as const;

    // Writes a report straight into the database, so a test can choose its time, state and decision.
    type StoredReport = {
        reporterId: string;
        reportedId: string;
        errandId: string;
        filedAt: string;
        state?: ReportState;
        decision?: { byId: string; justification: string; decidedAt: Date };
    };

    function storeReport(fields: StoredReport) {
        return ReportModel.create({ reason: REASON, ...fields, filedAt: new Date(fields.filedAt) });
    }

    async function adminWithReports() {
        const adminId = await createUser({ username: "admin", roles: [...ADMIN_ROLES] });
        const alice = await createUser({ username: "alice" });
        const bob = await createUser({ username: "bob" });
        const gone = randomUUID();
        const older = await storeReport({ reporterId: alice, reportedId: bob, errandId: "41", filedAt: "2026-10-20T08:00:00.000Z" });
        const decided = await storeReport({
            reporterId: gone,
            reportedId: bob,
            errandId: "42",
            filedAt: "2026-10-21T08:00:00.000Z",
            state: "Dismissed",
            decision: { byId: adminId, justification: "Both sides agree it was a misunderstanding", decidedAt: new Date("2026-10-22T08:00:00.000Z") },
        });
        const newest = await storeReport({ reporterId: bob, reportedId: alice, errandId: "43", filedAt: "2026-10-23T08:00:00.000Z" });
        return { admin: await loginAs("admin"), adminId, alice, bob, older, decided, newest };
    }

    it("list newest first with the accounts behind each report", async () => {
        const { admin, adminId, alice, bob, older, decided, newest } = await adminWithReports();

        const response = await admin.get("/reports").expect(200);

        expect(response.body).toMatchObject({ page: 1, pageSize: 20, total: 3 });
        expect(response.body.items.map((report: { id: string }) => report.id)).toEqual([newest._id, decided._id, older._id]);
        expect(response.body.items[2]).toEqual({
            id: older._id,
            reporter: { id: alice, fullName: "alice", username: "alice", state: "Active" },
            reported: { id: bob, fullName: "bob", username: "bob", state: "Active" },
            errandId: "41",
            reason: REASON,
            state: "Open",
            filedAt: "2026-10-20T08:00:00.000Z",
            decision: null,
        });
        // The reporter of this one was deleted since; the report stays readable
        expect(response.body.items[1]).toMatchObject({
            reporter: null,
            state: "Dismissed",
            decision: {
                by: { id: adminId, username: "admin" },
                justification: "Both sides agree it was a misunderstanding",
                decidedAt: "2026-10-22T08:00:00.000Z",
            },
        });
    });

    it("filter by state and by reported account, and page through them", async () => {
        const { admin, alice, bob, older, newest } = await adminWithReports();

        const open = await admin.get("/reports").query({ state: "Open" }).expect(200);
        const aboutBob = await admin.get("/reports").query({ reportedId: bob }).expect(200);
        const openAboutAlice = await admin.get("/reports").query({ state: "Open", reportedId: alice }).expect(200);
        const secondPage = await admin.get("/reports").query({ pageSize: 2, page: 2 }).expect(200);
        const unknown = await admin.get("/reports").query({ state: "Closed" }).expect(400);

        expect(open.body.items.map((report: { id: string }) => report.id)).toEqual([newest._id, older._id]);
        expect(aboutBob.body.total).toBe(2);
        expect(openAboutAlice.body.items).toMatchObject([{ id: newest._id }]);
        expect(secondPage.body).toMatchObject({ page: 2, total: 3, items: [{ id: older._id }] });
        expect(unknown.body.error.details.fields.state).toEqual(["must be Open, Dismissed or Actioned"]);
    });

    it("show one report, and name an unknown id", async () => {
        const { admin, decided } = await adminWithReports();

        const response = await admin.get(`/reports/${decided._id}`).expect(200);
        const unknown = await admin.get(`/reports/${randomUUID()}`).expect(404);

        expect(response.body).toMatchObject({ id: decided._id, errandId: "42", state: "Dismissed", reporter: null });
        expect(unknown.body.error.code).toBe("REPORT_NOT_FOUND");
    });

    it("are refused to members the same way whether or not the report exists", async () => {
        const { older } = await adminWithReports();
        const member = await loginAs("alice");

        await member.get("/reports").expect(403);
        const existing = await member.get(`/reports/${older._id}`).expect(403);
        const missing = await member.get(`/reports/${randomUUID()}`).expect(403);

        expect(existing.body).toEqual(missing.body);
    });
});

describe("deciding a report (F1.6.6, F1.6.7)", () => {
    const JUSTIFICATION = "Chat log confirms the errand was never delivered";

    // Alice reports bob through the API; the admin is logged in and ready to decide.
    async function openReport({ reportedState = "Active", reported = "bob" }: { reportedState?: AccountState; reported?: "bob" | "admin" } = {}) {
        const adminId = await createUser({ username: "admin", roles: ["member", "administrator"] });
        const aliceId = await createUser({ username: "alice" });
        const bob = await createUser({ username: "bob" });
        const admin = await loginAs("admin");
        const alice = await loginAs("alice");
        const bobAgent = await loginAs("bob");
        const reportedId = reported === "admin" ? adminId : bob;
        errand("42", aliceId, reportedId);
        const filed = await alice.post("/reports").send({ reportedId, errandId: "42", reason: REASON }).expect(201);
        if (reportedState !== "Active") await UserModel.updateOne({ _id: bob }, { $set: { state: reportedState } });
        return { admin, adminId, bob, bobAgent, reportId: filed.body.id as string };
    }

    it("dismisses an Open report and records who decided, why and when", async () => {
        const { admin, adminId, bob, reportId } = await openReport();
        const before = Date.now();

        const response = await admin.post(`/reports/${reportId}/decision`).send({ outcome: "Dismissed", justification: JUSTIFICATION }).expect(200);

        expect(response.body).toMatchObject({
            id: reportId,
            state: "Dismissed",
            reported: { id: bob, state: "Active" },
            decision: { by: { id: adminId, username: "admin" }, justification: JUSTIFICATION },
        });
        expect(Date.parse(response.body.decision.decidedAt)).toBeGreaterThanOrEqual(before);
        expect(await UserModel.findById(bob)).toMatchObject({ state: "Active" });
    });

    it("actions a report by suspending the reported account with the justification as reason", async () => {
        const { admin, adminId, bob, bobAgent, reportId } = await openReport();

        const response = await admin.post(`/reports/${reportId}/decision`).send({ outcome: "Actioned", justification: JUSTIFICATION }).expect(200);

        expect(response.body).toMatchObject({ state: "Actioned", reported: { id: bob, state: "Suspended" } });
        const account = await admin.get(`/users/${bob}`).expect(200);
        expect(account.body.stateChanges).toMatchObject([
            { from: "Active", to: "Suspended", reason: JUSTIFICATION, actor: { id: adminId } },
        ]);
        // F1.6.8 applies here as well
        expect(await SessionModel.countDocuments({ accountId: bob })).toBe(0);
        await bobAgent.get("/users/me").expect(401);
    });

    it("actions a report on an account that is already suspended and leaves the account as it is", async () => {
        const { admin, bob, reportId } = await openReport({ reportedState: "Suspended" });

        const response = await admin.post(`/reports/${reportId}/decision`).send({ outcome: "Actioned", justification: JUSTIFICATION }).expect(200);

        expect(response.body.state).toBe("Actioned");
        const account = await admin.get(`/users/${bob}`).expect(200);
        expect(account.body).toMatchObject({ state: "Suspended", stateChanges: [] });
    });

    it("refuses a justification outside 20 to 500 characters or an unknown outcome and keeps the report Open", async () => {
        const { admin, reportId } = await openReport();

        const tooShort = await admin.post(`/reports/${reportId}/decision`).send({ outcome: "Dismissed", justification: "Not enough proof" }).expect(400);
        const unknown = await admin.post(`/reports/${reportId}/decision`).send({ outcome: "Ignored", justification: JUSTIFICATION }).expect(400);

        expect(tooShort.body.error.details.fields.justification).toEqual(["must be between 20 and 500 characters"]);
        expect(unknown.body.error.details.fields.outcome).toEqual(["must be Dismissed or Actioned"]);
        expect(await ReportModel.findById(reportId)).toMatchObject({ state: "Open" });
    });

    it("changes a report only once, and names an unknown one", async () => {
        const { admin, reportId } = await openReport();

        await admin.post(`/reports/${reportId}/decision`).send({ outcome: "Dismissed", justification: JUSTIFICATION }).expect(200);
        const again = await admin.post(`/reports/${reportId}/decision`).send({ outcome: "Actioned", justification: JUSTIFICATION }).expect(409);
        const unknown = await admin.post(`/reports/${randomUUID()}/decision`).send({ outcome: "Dismissed", justification: JUSTIFICATION }).expect(404);

        expect(again.body.error.code).toBe("REPORT_ALREADY_DECIDED");
        expect(unknown.body.error.code).toBe("REPORT_NOT_FOUND");
        expect(await ReportModel.findById(reportId)).toMatchObject({ state: "Dismissed" });
    });

    it("lets exactly one of two parallel decisions apply", async () => {
        const { admin, bob, reportId } = await openReport();

        const results = await Promise.all([
            admin.post(`/reports/${reportId}/decision`).send({ outcome: "Dismissed", justification: JUSTIFICATION }),
            admin.post(`/reports/${reportId}/decision`).send({ outcome: "Actioned", justification: JUSTIFICATION }),
        ]);

        expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
        const report = await ReportModel.findById(reportId);
        const account = await UserModel.findById(bob);
        expect(account?.state).toBe(report?.state === "Actioned" ? "Suspended" : "Active");
    });

    it("puts the report back to Open when the suspension is refused", async () => {
        const { admin, adminId, reportId } = await openReport({ reported: "admin" });

        const refused = await admin.post(`/reports/${reportId}/decision`).send({ outcome: "Actioned", justification: JUSTIFICATION }).expect(409);

        expect(refused.body.error.code).toBe("OWN_ACCOUNT");
        const report = await ReportModel.findById(reportId);
        expect(report).toMatchObject({ state: "Open" });
        expect(report?.decision).toBeUndefined();
        expect(await UserModel.findById(adminId)).toMatchObject({ state: "Active" });
    });

    it("is refused to members", async () => {
        const { bobAgent, reportId } = await openReport();

        await bobAgent.post(`/reports/${reportId}/decision`).send({ outcome: "Dismissed", justification: JUSTIFICATION }).expect(403);

        expect(await ReportModel.findById(reportId)).toMatchObject({ state: "Open" });
    });
});
