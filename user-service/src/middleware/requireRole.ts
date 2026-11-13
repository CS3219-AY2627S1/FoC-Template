import type { RequestHandler } from "express";
import { AppError } from "../errors.ts";
import type { Role } from "../models/user.model.ts";
import { authOf } from "./authenticate.ts";

// Runs before any lookup, so a caller without the role gets the same answer
// whether or not the requested account exists
export function requireRole(role: Role): RequestHandler {
    return (req, _res, next) => {
        if (!authOf(req).account.roles.includes(role)) {
            throw new AppError(403, "FORBIDDEN", "You are not allowed to do this")
        }
        next();
    }
}