import jwt from "jsonwebtoken";
import type { RequestHandler } from "express";
import { env } from "../config/env.ts";
import { forbidden, unauthorized } from "../utils/httpError.ts";

export type Role = "ADMIN" | "REQUESTER" | "COURIER";

export interface AuthenticatedUser {
  id: string;
  roles: Role[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

const ROLES: readonly string[] = ["ADMIN", "REQUESTER", "COURIER"];
const isRole = (value: unknown): value is Role =>
  typeof value === "string" && ROLES.includes(value);

// Verifies the bearer token and sets req.user = { id, roles }.
// Thrown errors are forwarded to the error handler by Express 5.
export const authenticate: RequestHandler = (req, _res, next) => {
  const [scheme, token] = (req.headers.authorization || "").split(" ");
  if (scheme !== "Bearer" || !token) {
    throw unauthorized("Missing or malformed Authorization header");
  }

  let payload: string | jwt.JwtPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
  } catch {
    throw unauthorized("Invalid or expired token");
  }

  if (typeof payload === "string" || !payload.sub) {
    throw unauthorized("Token has no subject");
  }

  req.user = {
    id: String(payload.sub),
    roles: Array.isArray(payload.roles) ? payload.roles.filter(isRole) : [],
  };
  next();
};

// Allows the request if the user holds at least one of the given roles.
export const requireRoles =
  (...allowed: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) throw unauthorized("Authentication required.");
    if (!req.user.roles.some((role) => allowed.includes(role))) {
      throw forbidden(`Requires one of the roles: ${allowed.join(", ")}`);
    }
    next();
  };
