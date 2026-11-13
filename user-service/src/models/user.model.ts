import { randomUUID } from "node:crypto";
import { Schema, model, type InferSchemaType } from "mongoose";

export const ROLES = ["member", "administrator"] as const;
export type Role = (typeof ROLES)[number];

export const ACCOUNT_STATES = ["PendingVerification", "Active", "Suspended"] as const;
export type AccountState = (typeof ACCOUNT_STATES)[number];

// Usernames are unique regardless of case
export const USERNAME_COLLATION = { locale: "en", strength: 2 } as const;

const otpSchema = new Schema(
    {
        codeHash: { type: String, required: true },
        expiresAt: { type: Date, required: true },
        attemptsLeft: { type: Number, required: true },
        sentAt: { type: Date, required: true },
    },
    { _id: false },
);

// F1.1.7: the announcement to the Credit Service. It is written in the same update that makes the
// account Active and stays pending until the broker has confirmed it (an outbox inside the document).
const announcementSchema = new Schema(
    {
        eventId: { type: String, required: true },
        occurredAt: { type: Date, required: true },
        pending: { type: Boolean, required: true },
        sentAt: { type: Date },
    },
    { _id: false },
);

// F1.6.2: every suspension and reinstatement with who did it, why and when. The changeId lets a
// change that has to be undone remove exactly its own entry.
const stateChangeSchema = new Schema(
    {
        changeId: { type: String, required: true },
        from: { type: String, enum: ACCOUNT_STATES, required: true },
        to: { type: String, enum: ACCOUNT_STATES, required: true },
        reason: { type: String, required: true },
        actorId: { type: String, required: true },
        at: { type: Date, required: true },
    },
    { _id: false },
);

const userSchema = new Schema(
    {
        _id: { type: String, default: () => randomUUID() },
        fullName: { type: String, required: true, trim: true },
        email: { type: String, required: true, trim: true, lowercase: true },
        username: { type: String, required: true, trim: true },
        passwordHash: { type: String, required: true, select: false },
        roles: { type: [{ type: String, enum: ROLES }], default: ["member"] },
        state: { type: String, enum: ACCOUNT_STATES, default: "PendingVerification" },
        otp: { type: otpSchema, select: false },
        announcement: { type: announcementSchema, select: false },
        // Not selected by default, so resolving a session on every request does not load the history.
        stateChanges: { type: [stateChangeSchema], select: false },
    },
    {
        timestamps: { createdAt: true, updatedAt: true },
        versionKey: false
    }
)

userSchema.index({ email: 1}, { unique: true })
userSchema.index({ username: 1 }, { unique: true, collation: USERNAME_COLLATION });
userSchema.index({ createdAt: 1}, {expireAfterSeconds: 24 * 60 * 60, partialFilterExpression: { state: "PendingVerification"}});
// Holds only the accounts still waiting for their announcement, so the relay's query stays cheap.
userSchema.index(
    { "announcement.pending": 1, "announcement.occurredAt": 1 },
    { partialFilterExpression: { "announcement.pending": true } },
);

export type User = InferSchemaType<typeof userSchema>;
export const UserModel = model("User", userSchema);

export function toPublicUser(user: User) {
    return {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        username: user.username,
        roles: user.roles,
        state: user.state,
        createdAt: user.createdAt,
    }
}

export type PublicUser = ReturnType<typeof toPublicUser>;

// How one account appears inside another object, e.g. as the administrator behind a state change.
export function toAccountSummary(user: User) {
    return {
        id: user._id,
        fullName: user.fullName,
        username: user.username,
        state: user.state,
    }
}

export type AccountSummary = ReturnType<typeof toAccountSummary>;