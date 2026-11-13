import nodemailer from "nodemailer";
import { config } from "../config.ts";
import { logger } from "./logger.ts";

const transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined
});

// Callers do not wait for delivery. A failed delivery is logged, and
// the user can ask for a new code.
export function sendOtpMail(to: string, code: string): void {
    transporter
        .sendMail({
            from: config.MAIL_FROM,
            to,
            subject: "Your Relay verification code",
            text: `Your verification code is ${code}.\n\nIt is valid for 10 minutes`
        })
        .then(() => logger.info("verification code sent"))
        .catch((err: unknown) => logger.error({ err }, "could not send verification code"));
}