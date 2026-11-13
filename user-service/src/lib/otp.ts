import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { config } from "../config.ts";

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

export function createOtp(accountId: string, now = new Date()) {
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    return {
        code, 
        otp: {
            codeHash: hashCode(accountId, code),
            expiresAt: new Date(now.getTime() + OTP_TTL_MS),
            attemptsLeft: OTP_MAX_ATTEMPTS,
            sentAt: now
        }
    }
}

function hashCode(accountId: string, code: string): string {
    return createHmac("sha256", config.OTP_SECRET).update(`${accountId}:${code}`).digest("hex");
}

export function codeMatches(codeHash: string, accountId: string, code: string): boolean {
    const expected = Buffer.from(codeHash, "hex");
    const actual = Buffer.from(hashCode(accountId, code), "hex");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
}