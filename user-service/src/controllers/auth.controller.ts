import type { RequestHandler } from "express";
import { registerUser, loginUser } from "../services/auth.service.ts";
import { resendCode, verifyAccount } from "../services/verification.service.ts";
import { clearSessionCookie, SESSION_COOKIE, setSessionCookie } from "../lib/session-cookie.ts";
import { endSession } from "../services/session.service.ts";

export const register: RequestHandler = async (req, res) => {
    const user = await registerUser(req.body);
    res.status(201).json(user);
}

export const verify: RequestHandler = async (req, res) => {
    const user = await verifyAccount(req.body);
    res.status(200).json(user);
}

export const resend: RequestHandler = async (req, res) => {
    await resendCode(req.body);
    res.status(202).json({ message: "If an unverified account exists for this email, a new code has been sent" });
};

export const login: RequestHandler = async (req, res) => {
    const { user, token } = await loginUser(req.body);
    setSessionCookie(res, token);
    res.status(200).json(user);
}

export const logout: RequestHandler = async (req, res) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token === "string") await endSession(token);
    clearSessionCookie(res);
    res.status(204).end();
}