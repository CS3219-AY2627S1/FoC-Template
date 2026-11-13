import type { CookieOptions, Response } from "express";
import { config } from "../config.ts";
import { ABSOLUTE_TIMEOUT_MS } from "../services/session.service.ts";

export const SESSION_COOKIE = "relay_session";

const cookieOptions: CookieOptions = {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: "lax",
    path: "/"
};

export function setSessionCookie(res: Response, token: string): void {
    res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: ABSOLUTE_TIMEOUT_MS });
}

export function clearSessionCookie(res: Response): void {
    res.clearCookie(SESSION_COOKIE, cookieOptions);
}