
/**
 * AI Assistance Disclosure
 * Tool: GitHub Copilot (GPT-6 Luna)
 * Scope: JWT authentication and role-based access control middleware. (file was copied from supplier service)
 * Author review: Review before deployment.
 */

/**
 * AI Assistance Disclosure
 * Tool: GitHub Copilot, date: 2026-10-20
 * Scope: Verify Credit Service JWTs and enforce self-only access for user-scoped reads.
 * Author review: Review pending.
 */

import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedUser, JwtClaims, Role } from "../types/auth.js";

const isRole = (value: unknown): value is Role =>
	value === "ADMIN" || value === "REQUESTER" || value === "COURIER";

const unauthorized = (res: Response): void => {
	res.status(401).json({ status: 401, message: "Authentication required." });
};

export const authMiddleware = (
	req: Request,
	res: Response,
	next: NextFunction
): void => {
	const authorization = req.headers.authorization;
	const secret = process.env.JWT_SECRET;

	if (!authorization?.startsWith("Bearer ") || !secret) {
		unauthorized(res);
		return;
	}

	const token = authorization.slice(7).trim();
	if (!token) {
		unauthorized(res);
		return;
	}

	try {
		const payload = jwt.verify(token, secret);
		if (typeof payload === "string" || typeof payload.sub !== "string") {
			unauthorized(res);
			return;
		}

		const claims = payload as JwtClaims;
		const roles = Array.isArray(claims.roles) ? claims.roles.filter(isRole) : [];
		const user: AuthenticatedUser = {
			id: claims.sub,
			jti: typeof claims.jti === "string" ? claims.jti : "",
			exp: typeof claims.exp === "number" ? claims.exp : 0,
			roles,
		};

		req.user = user;
		next();
	} catch {
		unauthorized(res);
	}
};

export const authorizeRoles = (...allowedRoles: Role[]) =>
	(req: Request, res: Response, next: NextFunction): void => {
		if (!req.user) {
			unauthorized(res);
			return;
		}

		if (!req.user.roles.some((role) => allowedRoles.includes(role))) {
			res.status(403).json({ status: 403, message: "Forbidden." });
			return;
		}

		next();
	};

export const verifyUserIdentityOrAdmin = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    if (!req.user) {
        unauthorized(res);
        return;
    }
    const loggedInUserId = req.user.id;
    const requestedUserId = req.params.user_id;
    
    const isAdmin = req.user.roles.includes("ADMIN");

    if (isAdmin || loggedInUserId === requestedUserId) {
        return next();
    }
    res.status(403).json({ status: 403, message: "Forbidden" });
};

export default authMiddleware;