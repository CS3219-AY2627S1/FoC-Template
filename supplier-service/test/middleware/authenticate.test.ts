/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Generated unit tests for the authenticate middleware (missing/non-Bearer header, invalid
 *        token, valid token, User Service unreachable). No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5): moved from src/middleware/authenticate.test.ts to test/middleware/authenticate.test.ts and updated
 *        the relative imports; no test logic changed. No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review: Congchen
 * Tool: GitHub Copilot SDK in VS Code (model: GPT-5.6 Luna), date: 2026-10-20
 * Scope: Replaced User Service /auth/verify mocks with JWKS and locally signed RS256 token
 *        coverage for the authenticate middleware. No requirements, architecture, schema, or API
 *        decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-04, Claude Code, model: claude-sonnet-5-5): added a non-null assertion on one indexed access to fix a
 *        strict-typing error; no test logic changed. No requirements, architecture, schema, or API
 *        decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-02, Codex, model: GPT-6): made signature corruption deterministic.
 * Author review: Congchen
 */
import { generateKeyPairSync, createSign } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../src/middleware/errorHandler.js";
import { authenticate } from "../../src/middleware/authenticate.js";

function buildApp(): express.Express {
  const app = express();
  app.use(authenticate);
  app.get("/whoami", (req, res) => res.json({ user: req.user }));
  app.use(errorHandler);
  return app;
}

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const jwk = publicKey.export({ format: "jwk" });
let keyNumber = 0;

function token(
  overrides: Record<string, unknown> = {},
  kid = `test-${++keyNumber}`,
): string {
  const header = { alg: "RS256", typ: "JWT", kid };
  const payload = {
    sub: "u-1",
    role: "admin",
    exp: Math.floor(Date.now() / 1000) + 300,
    ...overrides,
  };
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  return `${signingInput}.${signer.sign(privateKey).toString("base64url")}`;
}

function jwksResponse(kid: string): Response {
  return new Response(
    JSON.stringify({
      keys: [{ ...jwk, kid, kty: "RSA", alg: "RS256", use: "sig" }],
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

describe("authenticate", () => {
  const app = buildApp();

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects a request with no Authorization header", async () => {
    const res = await request(app).get("/whoami");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Unauthorized");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a request whose header is not Bearer", async () => {
    const res = await request(app)
      .get("/whoami")
      .set("Authorization", "Basic abc123");
    expect(res.status).toBe(401);
  });

  it("rejects when the JWKS endpoint is unreachable", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await request(app)
      .get("/whoami")
      .set("Authorization", `Bearer ${token()}`);
    expect(res.status).toBe(401);
  });

  it("verifies a token locally and attaches its identity", async () => {
    const kid = `valid-${++keyNumber}`;
    vi.mocked(fetch).mockResolvedValue(jwksResponse(kid));
    const res = await request(app)
      .get("/whoami")
      .set("Authorization", `Bearer ${token({}, kid)}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ user_id: "u-1", role: "admin" });
    expect(fetch).toHaveBeenCalledWith(
      "http://user-service:3001/auth/.well-known/jwks.json",
    );
  });

  it("uses the cached JWKS for subsequent tokens", async () => {
    const kid = `cached-${++keyNumber}`;
    vi.mocked(fetch).mockResolvedValue(jwksResponse(kid));
    await request(app)
      .get("/whoami")
      .set("Authorization", `Bearer ${token({}, kid)}`);
    const res = await request(app)
      .get("/whoami")
      .set("Authorization", `Bearer ${token({}, kid)}`);
    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("refetches JWKS once when a token has an unknown kid", async () => {
    const knownKid = `known-${++keyNumber}`;
    const newKid = `new-${++keyNumber}`;
    vi.mocked(fetch)
      .mockResolvedValueOnce(jwksResponse(knownKid))
      .mockResolvedValueOnce(jwksResponse(newKid));
    await request(app)
      .get("/whoami")
      .set("Authorization", `Bearer ${token({}, knownKid)}`);
    const res = await request(app)
      .get("/whoami")
      .set("Authorization", `Bearer ${token({}, newKid)}`);
    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects expired and incorrectly signed tokens", async () => {
    const kid = `invalid-${++keyNumber}`;
    vi.mocked(fetch).mockResolvedValue(jwksResponse(kid));
    const expired = await request(app)
      .get("/whoami")
      .set(
        "Authorization",
        `Bearer ${token({ exp: Math.floor(Date.now() / 1000) - 1 }, kid)}`,
      );
    expect(expired.status).toBe(401);

    // AI-generated (edited by Congchen).
    const [header, payload, signature] = token({}, kid).split(".");
    const signatureBytes = Buffer.from(signature!, "base64url");
    signatureBytes[0]! ^= 1;
    const invalid = `${header}.${payload}.${signatureBytes.toString("base64url")}`;
    const invalidResponse = await request(app)
      .get("/whoami")
      .set("Authorization", `Bearer ${invalid}`);
    expect(invalidResponse.status).toBe(401);
  });
});
