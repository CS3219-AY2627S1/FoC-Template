/*
 * AI Assistance Disclosure:
 * Tool: GitHub Copilot SDK in VS Code (model: GPT-5.6 Luna), date: 2026-10-20
 * Scope: Replaced per-request User Service token verification with cached JWKS retrieval and
 *        local RS256 verification per user-service/docs/jwks-verification-guide.md. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-09, Claude Code, model: claude-sonnet-5): added a Supplier-Order-Service-Key
 *        fallback, scoped to GET /suppliers/:id and GET /suppliers/reference/location only, per
 *        instructions.md Stage 28 c1. A valid JWT still wins when both are sent; the key is
 *        checked only when there is no valid JWT. No requirements, architecture, schema, or API
 *        decisions were made by the AI tool.
 * Author review:
 */
import { createPublicKey, createVerify, type JsonWebKey } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { AppError } from "../utils/AppError.js";
import { constantTimeEqual } from "../utils/constantTimeEqual.js";

type Jwks = { keys: JsonWebKey[] };

let cachedJwks: Jwks | undefined;
let jwksRequest: Promise<Jwks> | undefined;

const SERVICE_KEY_HEADER = "supplier-order-service-key";

// GET /suppliers/:id and GET /suppliers/reference/location only (instructions.md Stage 28 c1).
// `req.path` here is relative to the apiV1 router, e.g. "/suppliers/reference/location" or
// "/suppliers/<id>".
function acceptsServiceKey(path: string): boolean {
  return path === "/suppliers/reference/location" || /^\/suppliers\/[^/]+$/.test(path);
}

function unauthorized(): AppError {
  return new AppError(
    401,
    "Unauthorized",
    "Bearer token is missing or invalid.",
  );
}

function invalidServiceKey(): AppError {
  return new AppError(
    401,
    "INVALID_SERVICE_KEY",
    "Supplier service key is missing or invalid.",
  );
}

function isJwks(value: unknown): value is Jwks {
  if (typeof value !== "object" || value === null) return false;
  const keys = (value as { keys?: unknown }).keys;
  if (!Array.isArray(keys)) return false;

  return keys.every((key) => {
    if (typeof key !== "object" || key === null) return false;
    const candidate = key as Record<string, unknown>;
    return (
      candidate.kty === "RSA" &&
      candidate.alg === "RS256" &&
      typeof candidate.kid === "string" &&
      typeof candidate.n === "string" &&
      typeof candidate.e === "string"
    );
  });
}

async function fetchJwks(force = false): Promise<Jwks> {
  if (jwksRequest) return jwksRequest;
  if (!force && cachedJwks) return cachedJwks;

  jwksRequest = (async () => {
    const response = await fetch(
      `${config.userServiceUrl}/auth/.well-known/jwks.json`,
    );
    if (!response.ok)
      throw new Error(`JWKS request failed with status ${response.status}`);

    const body: unknown = await response.json();
    if (!isJwks(body))
      throw new Error("User Service returned an invalid JWKS response");

    cachedJwks = body;
    return body;
  })();

  try {
    return await jwksRequest;
  } finally {
    jwksRequest = undefined;
  }
}

async function getKey(kid: string): Promise<JsonWebKey | undefined> {
  const current = await fetchJwks();
  const key = current.keys.find((candidate) => candidate.kid === kid);
  if (key) return key;

  const refreshed = await fetchJwks(true);
  return refreshed.keys.find((candidate) => candidate.kid === kid);
}

function decodeJsonSegment(segment: string): unknown {
  return JSON.parse(
    Buffer.from(segment, "base64url").toString("utf8"),
  ) as unknown;
}

function verifyAccessToken(
  token: string,
  key: JsonWebKey,
): { user_id: string; role: string } {
  const segments = token.split(".");
  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  if (
    segments.length !== 3 ||
    typeof encodedHeader !== "string" ||
    typeof encodedPayload !== "string" ||
    typeof encodedSignature !== "string" ||
    encodedHeader.length === 0 ||
    encodedPayload.length === 0 ||
    encodedSignature.length === 0
  ) {
    throw new Error("Malformed token");
  }

  const header = decodeJsonSegment(encodedHeader);
  const payload = decodeJsonSegment(encodedPayload);
  if (
    typeof header !== "object" ||
    header === null ||
    typeof payload !== "object" ||
    payload === null
  ) {
    throw new Error("Malformed token");
  }

  const payloadValues = payload as Record<string, unknown>;
  if (
    typeof payloadValues.sub !== "string" ||
    typeof payloadValues.role !== "string" ||
    typeof payloadValues.exp !== "number" ||
    payloadValues.exp <= Math.floor(Date.now() / 1000)
  ) {
    throw new Error("Invalid token claims");
  }

  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  verifier.end();
  if (
    !verifier.verify(
      createPublicKey({ key, format: "jwk" }),
      Buffer.from(encodedSignature, "base64url"),
    )
  ) {
    throw new Error("Invalid token signature");
  }

  return { user_id: payloadValues.sub, role: payloadValues.role };
}

// Falls back to the Supplier-Order-Service-Key on the two routes that accept it, when there is
// no valid JWT. Any other route, or a missing key, gets the original "no valid JWT" error.
function fallbackToServiceKeyOrUnauthorized(req: Request, next: NextFunction): void {
  const suppliedKey = req.headers[SERVICE_KEY_HEADER];
  if (!acceptsServiceKey(req.path) || typeof suppliedKey !== "string") {
    next(unauthorized());
    return;
  }

  if (!constantTimeEqual(suppliedKey, config.supplierOrderServiceApiKey)) {
    next(invalidServiceKey());
    return;
  }

  req.supplierServiceKeyAuthenticated = true;
  next();
}

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (
    !authHeader ||
    !authHeader.startsWith("Bearer ") ||
    authHeader.length <= "Bearer ".length
  ) {
    fallbackToServiceKeyOrUnauthorized(req, next);
    return;
  }

  try {
    const token = authHeader.slice("Bearer ".length);
    const segments = token.split(".");
    const header = decodeJsonSegment(segments[0] ?? "");
    if (typeof header !== "object" || header === null)
      throw new Error("Malformed token");

    const headerValues = header as Record<string, unknown>;
    if (headerValues.alg !== "RS256" || typeof headerValues.kid !== "string") {
      throw new Error("Unsupported token");
    }

    const key = await getKey(headerValues.kid);
    if (!key) {
      fallbackToServiceKeyOrUnauthorized(req, next);
      return;
    }

    req.user = verifyAccessToken(token, key);
    next();
  } catch {
    fallbackToServiceKeyOrUnauthorized(req, next);
  }
}
