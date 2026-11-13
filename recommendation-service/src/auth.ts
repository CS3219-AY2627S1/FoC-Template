import type { NextFunction, Request, Response } from "express";
import { config } from "./config.ts";

const SESSION_COOKIE = "relay_session";
const TIMEOUT_MS = 2000;

type Role = "member" | "administrator";

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

export function authorize(requiredRole: Role = "member") {
    return async (req: Request, res: Response, next: NextFunction) => {
        const token = sessionToken(req.headers.cookie);
        if (!token) return res.status(401).send("Please authenticate");

        try {
            const response = await fetch(new URL("/internal/authorize", config.USER_SERVICE_URL), {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ token, requiredRole }),
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
            if (response.ok) {
                const body = (await response.json().catch(() => null)) as { decision?: string; accountId?: string } | null;
                if (body?.decision === "authorized") {
                    res.locals.accountId = body.accountId;
                    return next();
                }
            }
        } catch {
        }
        return res.status(403).send("Forbidden");
    };
}
