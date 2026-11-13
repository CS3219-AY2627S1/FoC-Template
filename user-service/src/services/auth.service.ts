import mongoose from "mongoose";
import { hashPassword, verifyPassword } from "../lib/password.ts";
import { logger } from "../lib/logger.ts";
import { fieldErrorsOf, validationError, type FieldErrors } from "../lib/validation.ts";
import { toPublicUser, UserModel, USERNAME_COLLATION, type PublicUser } from "../models/user.model.ts";
import { RegisterBody, LoginBody } from "../schemas/auth.schemas.ts";
import { randomUUID, randomBytes } from "node:crypto";
import { sendOtpMail } from "../lib/mailer.ts";
import { createOtp } from "../lib/otp.ts";
import { AppError } from "../errors.ts";
import { createSession } from "./session.service.ts";

export async function registerUser(input: unknown): Promise<PublicUser> {
    const parsed = RegisterBody.safeParse(input);
    const fields: FieldErrors = parsed.success ? {} : fieldErrorsOf(parsed.error);

    const body = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
    for (const field of await findTakenFields(body.email, body.username)) {
        (fields[field] ??= []).push("is already in use");
    }

    if (!parsed.success || Object.keys(fields).length > 0) {
        throw validationError(fields);
    }

    const { password, ...profile } = parsed.data;
    try {
        const id = randomUUID();
        const { code, otp } = createOtp(id);
        const user = await UserModel.create({ _id: id, ...profile, passwordHash: await hashPassword(password), otp });
        logger.info({ accountId: user._id }, "account registered");
        sendOtpMail(user.email, code);
        return toPublicUser(user);
    } catch (err) {
        if (err instanceof mongoose.mongo.MongoServerError && err.code === 11000) {
            const field = Object.keys(err.keyPattern ?? {})[0] ?? "body";
            throw validationError({ [field]: ["is already in use"] });
        }
        throw err;
    }
}

async function findTakenFields(email: unknown, username: unknown): Promise<string[]> {
    const taken: string[] = [];
    if (typeof email === "string" && email.trim() !== "") {
        if (await UserModel.exists({ email: email.trim().toLowerCase() })) {
            taken.push("email");
        }
    }

    if (typeof username === "string" && username.trim() !== "") {
        if (await UserModel.exists({ username: username.trim()} ).collation(USERNAME_COLLATION)) {
            taken.push("username");
        }
    }

    return taken;
}

// Checked when no account matches, so an unknown identifier takes as long to
// refuse as a wrong password and the response time reveals nothing
const DUMMY_HASH = await hashPassword(randomBytes(16).toString("hex"));

export async function loginUser(input: unknown): Promise<{ user: PublicUser; token: string }> {
    const parsed = LoginBody.safeParse(input);
    if (!parsed.success) throw validationError(fieldErrorsOf(parsed.error));
    const { identifier, password } = parsed.data;
    
    // Login either by email or username
    const query = identifier.includes("@") ?
        UserModel.findOne({ email: identifier.toLowerCase() }) :
        UserModel.findOne({ username: identifier }).collation(USERNAME_COLLATION)
    const user = await query.select("+passwordHash");

    const passwordMatches = await verifyPassword(user?.passwordHash ?? DUMMY_HASH, password);
    if (!user || !passwordMatches) {
        throw new AppError(401, "INVALID_CREDENTIALS", "Wrong username, email, or password");
    }

    // Checked only after the password, so the state of an account is never
    // revealed to someone who does not know its password
    if (user.state === "PendingVerification") {
        throw new AppError(403, "ACCOUNT_NOT_VERIFIED", "Please verify your email address first");
    }
    if (user.state !== "Active") {
        throw new AppError(403, "ACCOUNT_SUSPENDED", "This account is suspended");
    }

    const token = await createSession(user._id);
    logger.info({ accountId: user._id }, "login succeeded");
    return { user: toPublicUser(user), token };
}