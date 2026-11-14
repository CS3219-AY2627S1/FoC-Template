/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-08
 * Scope: Added tests for the team-specified conversation listing and reused authentication.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 */

import { generateKeyPairSync, sign } from "node:crypto";
import { createTokenVerifier } from "./authenticate.js";
const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...pair.publicKey.export({ format: "jwk" }), kid: "test-key" };
function token(
  payload: object,
  header: object = { alg: "RS256", kid: "test-key" },
) {
  const input = [header, payload]
    .map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"))
    .join(".");
  return (
    input +
    "." +
    sign("RSA-SHA256", Buffer.from(input), pair.privateKey).toString(
      "base64url",
    )
  );
}
afterEach(() => vi.unstubAllGlobals());
it("verifies the signature and identity and caches the JWKS", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ keys: [jwk] }) });
  vi.stubGlobal("fetch", fetcher);
  const verify = createTokenVerifier("http://user-service:3001");
  const jwt = token({ sub: "user-1", exp: 9999999999, role: "student" });
  expect(await verify(jwt)).toEqual({
    user_id: "user-1",
    exp: 9999999999,
    role: "student",
  });
  await verify(jwt);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(String(fetcher.mock.calls[0]![0])).toBe(
    "http://user-service:3001/auth/.well-known/jwks.json",
  );
});
it("refreshes the JWKS when encountering a new key ID", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ keys: [] }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ keys: [jwk] }) });
  vi.stubGlobal("fetch", fetcher);
  await expect(
    createTokenVerifier("http://user-service:3001")(
      token({ sub: "u", exp: 9999999999 }),
    ),
  ).resolves.toMatchObject({ user_id: "u" });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it.each([
  token({ sub: "u", exp: 0 }),
  token({ exp: 9999999999 }),
  token({ sub: "u", exp: 9999999999 }, { alg: "HS256", kid: "test-key" }),
  "not-a-token",
])("rejects invalid/expired tokens", async (jwt) => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ keys: [jwk] }) }),
  );
  await expect(
    createTokenVerifier("http://user-service:3001")(jwt),
  ).rejects.toThrow();
});
it("rejects a tampered signature", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ keys: [jwk] }) }),
  );
  const jwt = token({ sub: "u", exp: 9999999999 });
  const parts = jwt.split(".");
  parts[2] = Buffer.alloc(256).toString("base64url");
  await expect(
    createTokenVerifier("http://user-service:3001")(parts.join(".")),
  ).rejects.toThrow();
});
it("rejects when JWKS is unavailable", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
  await expect(
    createTokenVerifier("http://user-service:3001")(
      token({ sub: "u", exp: 9999999999 }),
    ),
  ).rejects.toThrow();
});
