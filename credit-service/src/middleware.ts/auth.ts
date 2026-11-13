import dotenv from "dotenv";
import type { NextFunction, Request, Response } from "express";
dotenv.config();

const USER_SERVICE_URL = process.env.USER_SERVICE_URL ?? "http://localhost:3001";
const SESSION_COOKIE = "relay_session";
const TIMEOUT_MS = 2000;

type Role = "member" | "administrator";

// Pull the relay_session value out of the raw Cookie header.
function sessionToken(cookieHeader: string | undefined): string | null {
    if (!cookieHeader) return null;
    for (const part of cookieHeader.split(";")) {
        const eq = part.indexOf("=");
        if (eq === -1 || part.slice(0, eq).trim() !== SESSION_COOKIE) continue;
        const value = part.slice(eq + 1).trim();
        return value === "" ? null : value;
    }
    return null;
}

// The User Service is the only authority on who is logged in and what they may do,
// so every protected request asks it and we fail closed (N4.3): no session is 401,
// and a denial, a timeout, a non-200, or any other answer is 403. The check runs
// before the route, so a refused request reads no credit data and changes no state.
// ponytail: no auth cache yet; add a short-TTL read cache like supplier-service/src/cache.ts if N4.2 latency needs it.
export function authorize(requiredRole: Role = "member") {
    return async (req: Request, res: Response, next: NextFunction) => {
        const token = sessionToken(req.headers.cookie);
        if (!token) return res.status(401).send("Please authenticate");

        try {
            const response = await fetch(new URL("/internal/authorize", USER_SERVICE_URL), {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ token, requiredRole }),
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
            if (response.ok) {
                const body = (await response.json().catch(() => null)) as { decision?: string; accountId?: string; roles?: string[] } | null;
                if (body?.decision === "authorized") {
                    res.locals.accountId = body.accountId;
                    res.locals.roles = body.roles ?? [];
                    return next();
                }
            }
        } catch {
            // Timeout or User Service unreachable: fall through to deny (fail closed, N4.3).
        }
        return res.status(403).send("Forbidden");
    };
}

// A balance or ledger belongs to one account. A member may read only their own (authorize set
// res.locals.accountId); an administrator may read any, because the admin console shows a
// student's credits. Checked before any lookup, so a refusal never reveals whether the account
// exists (matching the authorize() pattern above).
export function canReadAccount(accountId: unknown, roles: unknown, userId: string): boolean {
    return accountId === userId || isAdministrator(roles);
}

// The admin ledger is everyone's movements, not one account's, so an authorized member reaching it
// is still refused. Only an administrator may read it.
export function isAdministrator(roles: unknown): boolean {
    return Array.isArray(roles) && roles.includes("administrator");
}
