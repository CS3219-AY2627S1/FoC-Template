import { randomUUID } from "node:crypto";
import { connectBroker, publishEvent, type Event } from "../broker.ts";
import { logger } from "../lib/logger.ts";
import { UserModel } from "../models/user.model.ts";

export const ACCOUNT_ACTIVATED = "user.account.activated";

const RELAY_INTERVAL_MS = 1000;
const RELAY_BATCH_SIZE = 50;

// The eventId is fixed here, so every repetition of the announcement carries the same one (F1.1.7).
export function newAnnouncement(occurredAt = new Date()) {
    return { eventId: randomUUID(), occurredAt, pending: true };
}

// Accounts that were already Active before announcements existed get one now, so every Active
// account ends up with a credit account. Returns how many were added.
export async function ensureAnnouncements(): Promise<number> {
    const missing = await UserModel.find({ state: "Active", announcement: { $exists: false } }, { _id: 1 });
    let added = 0;
    for (const { _id } of missing) {
        // The filter repeats the condition, so two instances starting at once add only one.
        const result = await UserModel.updateOne(
            { _id, announcement: { $exists: false } },
            { $set: { announcement: newAnnouncement() } },
        );
        added += result.modifiedCount;
    }
    if (added > 0) logger.info({ count: added }, "announcements added for existing accounts");
    return added;
}

// One pass over the pending announcements, oldest first. Stops at the first failure and leaves the
// rest pending for the next pass. Returns how many the broker confirmed.
export async function relayAnnouncements(publish: (event: Event) => Promise<void> = publishEvent): Promise<number> {
    const pending = await UserModel.find({ "announcement.pending": true })
        .select("+announcement")
        .sort({ "announcement.occurredAt": 1 })
        .limit(RELAY_BATCH_SIZE)
        .lean();

    let sent = 0;
    for (const user of pending) {
        if (!user.announcement) continue;
        const { eventId, occurredAt } = user.announcement;
        await publish({
            eventId,
            type: ACCOUNT_ACTIVATED,
            occurredAt: occurredAt.toISOString(),
            data: { accountId: user._id },
        });
        await UserModel.updateOne(
            { _id: user._id, "announcement.eventId": eventId },
            { $set: { "announcement.pending": false, "announcement.sentAt": new Date() } },
        );
        logger.info({ accountId: user._id, eventId }, "account announced");
        sent++;
    }
    return sent;
}

let timer: NodeJS.Timeout | undefined;
let running = false;
let lastProblem: string | undefined;

// Runs a pass every second, which keeps announcements well within the 5 seconds of N7.1. A problem
// is logged when it starts and when it changes, not on every pass.
export function startAnnouncementRelay(): void {
    running = true;
    const pass = async () => {
        try {
            await connectBroker();
            await relayAnnouncements();
            if (lastProblem) logger.info("announcements are flowing again");
            lastProblem = undefined;
        } catch (err) {
            const problem = err instanceof Error ? err.message : String(err);
            if (problem !== lastProblem) logger.warn({ err }, "announcements are waiting");
            lastProblem = problem;
        }
        if (running) timer = setTimeout(pass, RELAY_INTERVAL_MS);
    };
    timer = setTimeout(pass, 0);
}

export function stopAnnouncementRelay(): void {
    running = false;
    clearTimeout(timer);
}
