import { Schema, model } from "mongoose";

const sessionSchema = new Schema(
    {
        // SHA-256 of the session token, the token itself is never stored.
        _id: { type: String, required: true },
        accountId: { type: String, required: true, index: true },
        createdAt: { type: Date, required: true },
        lastSeenAt: { type: Date, required: true },
        expiresAt: { type: Date, required: true },
    },
    { versionKey: false },
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SessionModel = model("Session", sessionSchema);