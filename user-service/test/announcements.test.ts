import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { Event } from "../src/broker.ts";
import { UserModel } from "../src/models/user.model.ts";
import {
    ACCOUNT_ACTIVATED,
    ensureAnnouncements,
    relayAnnouncements,
} from "../src/services/announcement.service.ts";
import { useTestDatabase } from "./helpers/db.ts";
import { app, createUser, lastCodeSentTo } from "./helpers/users.ts";

useTestDatabase();

async function registerAndVerify(username: string): Promise<string> {
    const email = `${username}@u.nus.edu`;
    await request(app)
        .post("/auth/register")
        .send({ fullName: username, email, username, password: "long-enough-password" })
        .expect(201);
    const response = await request(app)
        .post("/auth/verify")
        .send({ email, code: lastCodeSentTo(email) })
        .expect(200);
    return response.body.id;
}

async function announcementOf(accountId: string) {
    const user = await UserModel.findById(accountId).select("+announcement").lean();
    return user?.announcement;
}

function fakePublisher() {
    return vi.fn<(event: Event) => Promise<void>>().mockResolvedValue(undefined);
}

describe("announcing activated accounts (F1.1.7)", () => {
    it("writes a pending announcement when an account is verified", async () => {
        const accountId = await registerAndVerify("bob");

        expect(await announcementOf(accountId)).toMatchObject({ pending: true, eventId: expect.any(String) });
    });

    it("does not announce an account that is still waiting for verification", async () => {
        await request(app)
            .post("/auth/register")
            .send({ fullName: "Carol", email: "carol@u.nus.edu", username: "carol", password: "long-enough-password" })
            .expect(201);

        const publish = fakePublisher();
        expect(await relayAnnouncements(publish)).toBe(0);
        expect(publish).not.toHaveBeenCalled();
    });

    it("publishes the announcement with the account id and marks it sent", async () => {
        const accountId = await registerAndVerify("bob");
        const { eventId } = (await announcementOf(accountId))!;
        const publish = fakePublisher();

        expect(await relayAnnouncements(publish)).toBe(1);

        expect(publish).toHaveBeenCalledWith({
            eventId,
            type: ACCOUNT_ACTIVATED,
            occurredAt: expect.any(String),
            data: { accountId },
        });
        expect(await announcementOf(accountId)).toMatchObject({ pending: false, sentAt: expect.any(Date) });
    });

    it("publishes each announcement only once after it was confirmed", async () => {
        await registerAndVerify("bob");
        const publish = fakePublisher();

        await relayAnnouncements(publish);
        await relayAnnouncements(publish);

        expect(publish).toHaveBeenCalledTimes(1);
    });

    it("keeps an announcement pending while publishing fails and repeats it with the same eventId", async () => {
        const accountId = await registerAndVerify("bob");
        const publish = fakePublisher().mockRejectedValueOnce(new Error("broker unreachable"));

        await expect(relayAnnouncements(publish)).rejects.toThrow("broker unreachable");
        expect((await announcementOf(accountId))?.pending).toBe(true);

        await relayAnnouncements(publish);

        const [first, second] = publish.mock.calls.map(([event]) => event.eventId);
        expect(second).toBe(first);
        expect((await announcementOf(accountId))?.pending).toBe(false);
    });

    it("leaves the announcements after a failure pending for the next pass", async () => {
        await registerAndVerify("bob");
        await registerAndVerify("dave");
        const publish = fakePublisher().mockRejectedValueOnce(new Error("broker unreachable"));

        await expect(relayAnnouncements(publish)).rejects.toThrow();
        expect(publish).toHaveBeenCalledTimes(1);
        expect(await UserModel.countDocuments({ "announcement.pending": true })).toBe(2);

        expect(await relayAnnouncements(publish)).toBe(2);
    });
});

describe("accounts that were Active before announcements existed", () => {
    it("get one announcement each, and accounts waiting for verification none", async () => {
        const active = await createUser({ username: "alice" });
        const pending = await createUser({ username: "erin", state: "PendingVerification" });

        expect(await ensureAnnouncements()).toBe(1);
        expect(await ensureAnnouncements()).toBe(0);

        expect((await announcementOf(active))?.pending).toBe(true);
        expect(await announcementOf(pending)).toBeUndefined();
    });

    it("keep an announcement they already have", async () => {
        const accountId = await registerAndVerify("bob");
        const before = await announcementOf(accountId);

        await ensureAnnouncements();

        expect((await announcementOf(accountId))?.eventId).toBe(before?.eventId);
    });
});
