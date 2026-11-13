import { generateToken, hashToken } from "../lib/tokens.ts";
import { SessionModel } from "../models/session.model.ts";
import { toPublicUser, UserModel, type PublicUser } from "../models/user.model.ts";

export const IDLE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;
export const ABSOLUTE_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60 * 1000;

export type Auth = { account: PublicUser; sessionId: string }

function expiryFor(createdAt: Date, lastSeenAt: Date): Date {
    return new Date(Math.min(lastSeenAt.getTime() + IDLE_TIMEOUT_MS, createdAt.getTime() + ABSOLUTE_TIMEOUT_MS));
}

export async function createSession(accountId: string): Promise<string> {
    const token = generateToken();
    const now = new Date();
    await SessionModel.create({
        _id: hashToken(token),
        accountId,
        createdAt: now,
        lastSeenAt: now,
        expiresAt: expiryFor(now, now)
    });
    return token;
}

export async function resolveSession(token: string): Promise<Auth | null> {
    const now = new Date();
    const session = await SessionModel.findOne({ _id: hashToken(token), expiresAt: { $gt: now }});
    if (!session) return null;

    const account = await UserModel.findById(session.accountId);
    if (!account || account.state !== "Active") {
        return null;
    }

    if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
        await SessionModel.updateOne(
            { _id: session._id },
            { $set: { lastSeenAt: now, expiresAt: expiryFor(session.createdAt, now) }}
        );
    }

    return { account: toPublicUser(account), sessionId: session._id };
}

export async function endSession(token: string): Promise<void> {
    await SessionModel.deleteOne({ _id: hashToken(token) });
}

export async function endAllSessions(accountId: string, exceptSessionId?: string): Promise<void> {
    await SessionModel.deleteMany({ accountId, _id: { $ne: exceptSessionId } });
}