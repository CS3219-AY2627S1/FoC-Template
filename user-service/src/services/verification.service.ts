import { AppError } from "../errors.ts";
import { logger } from "../lib/logger.ts";
import { sendOtpMail } from "../lib/mailer.ts";
import { codeMatches, createOtp, OTP_RESEND_COOLDOWN_MS } from "../lib/otp.ts";
import { fieldErrorsOf, validationError } from "../lib/validation.ts";
import { toPublicUser, UserModel, type PublicUser } from "../models/user.model.ts";
import { ResendBody, VerifyBody } from "../schemas/auth.schemas.ts";
import { newAnnouncement } from "./announcement.service.ts";

export async function verifyAccount(input: unknown): Promise<PublicUser> {
    const parsed = VerifyBody.safeParse(input);
    if (!parsed.success) throw validationError(fieldErrorsOf(parsed.error));
    const { email, code } = parsed.data;
    const now = new Date();

    const user = await UserModel.findOneAndUpdate(
        {
            email,
            state: "PendingVerification",
            "otp.expiresAt": { $gt: now },
            "otp.attemptsLeft": { $gt: 0 } 
        },
        { $inc: { "otp.attemptsLeft": -1 }},
        { returnDocument: "after" }
    ).select("+otp");

    if (!user?.otp) throw await rejectionReason(email, now);

    if (!codeMatches(user.otp.codeHash, user._id, code)) {
        throw new AppError(400, "CODE_INVALID", "The code is wrong", {
            attemptsLeft: user.otp.attemptsLeft,
        });
    }

    const activated = await UserModel.findOneAndUpdate(
        { _id: user._id, state: "PendingVerification", "otp.codeHash": user.otp.codeHash },
        // The announcement goes into the same atomic update, so an Active account is never left without one (F1.1.7).
        { $set: { state: "Active", announcement: newAnnouncement(now) }, $unset: { otp: 1 } },
        { returnDocument: "after" },
    );
    if (!activated) {
        throw new AppError(400, "CODE_INVALID", "The code is no longer valid");
    }

    logger.info({ accountId: activated._id }, "account verified");
    return toPublicUser(activated);
}

async function rejectionReason(email: string, now: Date): Promise<AppError> {
    const user = await UserModel.findOne({ email, state: "PendingVerification" }).select("+otp");
    if (!user?.otp) {
        return new AppError(400, "CODE_INVALID", "The code is wrong");
    }
    if (user.otp.expiresAt <= now) {
        return new AppError(400, "CODE_EXPIRED", "The code has expired, request a new one");
    }
    return new AppError(400, "TOO_MANY_ATTEMPTS", "Too many wrong entries, request a new code");
}

export async function resendCode(input: unknown): Promise<void> {
    const parsed = ResendBody.safeParse(input);
    if (!parsed.success) throw validationError(fieldErrorsOf(parsed.error));
    const { email } = parsed.data;
    const now = new Date();

    const user = await UserModel.findOne({ email, state: "PendingVerification" }, { _id: 1 });
    if (!user) return;

    const { code, otp } = createOtp(user._id, now);
    const result = await UserModel.updateOne(
        {
            _id: user._id,
            state: "PendingVerification",
            "otp.sentAt": { $lte: new Date(now.getTime() - OTP_RESEND_COOLDOWN_MS) },
        },
        { $set: { otp } },
    );
    if (result.modifiedCount === 1) sendOtpMail(email, code);
}