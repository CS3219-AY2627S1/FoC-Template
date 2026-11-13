import { config } from "./config.ts";
import { logger } from "./lib/logger.ts";
import { hashPassword } from "./lib/password.ts";
import { UserModel } from "./models/user.model.ts";
import { newAnnouncement } from "./services/announcement.service.ts";
import mongoose from "mongoose";

// F1.5.6: without an administrator nobody could promote anyone, so one is
// created from the environment whenever none exists.
export async function ensureAdministrator(): Promise<void> {
    if (await UserModel.exists({ roles: "administrator" })) return;

    const existing = await UserModel.findOne({ email: config.ADMIN_EMAIL }).select("+announcement");
    if (existing) {
        existing.roles = ["member", "administrator"];
        existing.state = "Active";
        existing.otp = undefined;
        if (!existing.announcement) existing.announcement = newAnnouncement();
        await existing.save();
        logger.warn({ accountId: existing._id }, "existing account promoted to administrator");
        return;
    }

    const admin = await UserModel.create({
        fullName: "Administrator",
        email: config.ADMIN_EMAIL,
        username: config.ADMIN_USERNAME,
        passwordHash: await hashPassword(config.ADMIN_PASSWORD),
        roles: ["member", "administrator"],
        state: "Active",
        announcement: newAnnouncement(),
    })
    logger.info({ accountId: admin._id }, "administrator account created");
}

// Accounts the final demo logs in with, so nobody has to register and verify an email live.
export const DEMO_STUDENTS = [
    { fullName: "Alice Tan", email: "alice.tan@u.nus.edu", username: "alice.tan" },
    { fullName: "Ben Lim", email: "ben.lim@u.nus.edu", username: "ben.lim" },
    { fullName: "Chloe Ng", email: "chloe.ng@u.nus.edu", username: "chloe.ng" },
    { fullName: "Daniel Koh", email: "daniel.koh@u.nus.edu", username: "daniel.koh" },
] as const;

// Creates the demo students that do not exist yet and leaves every existing account as it is,
// password included. Returns how many were created.
export async function seedDemoStudents(password: string): Promise<number> {
    // The unique indexes decide between replicas starting at once, so they have to exist first.
    await UserModel.init();
    const passwordHash = await hashPassword(password);
    let created = 0;
    for (const student of DEMO_STUDENTS) {
        try {
            await UserModel.create({
                ...student,
                passwordHash,
                roles: ["member"],
                state: "Active",
                // Announced like a verified account, so the credit-service opens it with 50 credits.
                announcement: newAnnouncement(),
            });
            created++;
        } catch (err) {
            if (err instanceof mongoose.mongo.MongoServerError && err.code === 11000) continue;
            throw err;
        }
    }
    if (created > 0) logger.info({ count: created }, "demo students created");
    return created;
}