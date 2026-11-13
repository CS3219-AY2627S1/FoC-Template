/**
 * AI Assistance Disclosure
 * Tool: GitHub Copilot, date: 2026-10-20
 * Scope: Add Supplier Service-owned JWT authentication and role authorization.
 * Author review: Review pending.
 */

import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import type { Role } from "../models/auth.ts";

const roles = ["ADMIN", "REQUESTER", "COURIER"] as const satisfies readonly Role[];

const isRole = (value: unknown): value is Role =>
  roles.includes(value as Role);

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

  if (!authorization?.startsWith("Bearer ") || !secret?.trim()) {
    unauthorized(res);
    return;
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) {
    unauthorized(res);
    return;
  }

  try {
    const decoded = jwt.verify(token, secret);
    if (typeof decoded !== "object" || decoded === null) {
      unauthorized(res);
      return;
    }

    const claims = decoded as jwt.JwtPayload & { roles?: unknown };
    if (
      typeof claims.sub !== "string" ||
      claims.sub.trim().length === 0 ||
      !Array.isArray(claims.roles) ||
      !claims.roles.every(isRole)
    ) {
      unauthorized(res);
      return;
    }

    req.user = {
      id: claims.sub,
      roles: claims.roles,
      ...(typeof claims.jti === "string" ? { jti: claims.jti } : {}),
      ...(typeof claims.exp === "number" ? { exp: claims.exp } : {}),
    };

    next();
  } catch {
    unauthorized(res);
  }
};

export const requireRoles = (...allowedRoles: Role[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ status: 401, message: "Authentication required." });
      return;
    }

    if (!req.user.roles.some((role) => allowedRoles.includes(role))) {
      res.status(403).json({ status: 403, message: "Forbidden." });
      return;
    }

    next();
  };

export default authMiddleware;