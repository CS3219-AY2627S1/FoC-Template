import { describe, expect, it } from "vitest";
import { codeMatches, createOtp, OTP_MAX_ATTEMPTS, OTP_TTL_MS } from "../../src/lib/otp.ts";

describe("createOtp", () => {
    it("creates a 6-digit code that is valid for 10 minutes with 5 attempts", () => {
        const now = new Date("2026-09-24T10:00:00Z");
        const { code, otp } = createOtp("account-1", now);

        expect(code).toMatch(/^\d{6}$/);
        expect(otp.expiresAt.getTime() - now.getTime()).toBe(OTP_TTL_MS);
        expect(otp.attemptsLeft).toBe(OTP_MAX_ATTEMPTS);
    });

    it("never stores the code itself", () => {
        const { code, otp } = createOtp("account-1");
        expect(otp.codeHash).not.toContain(code);
        expect(otp.codeHash).toMatch(/^[0-9a-f]{64}$/);
    });
});

describe("codeMatches", () => {
    it("accepts the right code for the right account only", () => {
        const { code, otp } = createOtp("account-1");

        expect(codeMatches(otp.codeHash, "account-1", code)).toBe(true);
        expect(codeMatches(otp.codeHash, "account-2", code)).toBe(false);
        expect(codeMatches(otp.codeHash, "account-1", code === "000000" ? "000001" : "000000")).toBe(false);
    });
});