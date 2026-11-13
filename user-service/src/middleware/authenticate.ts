import type { Request, RequestHandler } from "express";
import { AppError } from "../errors.ts";
import { clearSessionCookie, SESSION_COOKIE } from "../lib/session-cookie.ts";
import { resolveSession, type Auth } from "../services/session.service.ts";

export const authenticate: RequestHandler = async (req, res, next) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    const auth = typeof token === "string" ? await resolveSession(token) : null;
    if (!auth) {
        clearSessionCookie(res);
        throw new AppError(401, "UNAUTHENTICATED", "Please log in");
    }
    req.auth = auth;
    next();
}

export function authOf(req: Request): Auth {
    if (!req.auth) throw new AppError(401, "UNAUTHENTICATED", "Please log in");
    return req.auth;
}