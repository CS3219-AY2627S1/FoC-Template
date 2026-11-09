/* AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-11-09.
 * Scope: HTTP config validation and migration independence for #58.
 * Author review: Pending. */
import assert from "node:assert/strict";
import { it } from "node:test";
import { loadHttpConfig, loadDatabaseConfig } from "../src/config";

it("validates HTTP settings without adding migration-only requirements", () => {
  const keys = ["USER_SERVICE_BASE_URL", "PORT", "USER_SERVICE_VERIFY_TIMEOUT_MS", "DATABASE_URL"];
  const original = keys.map((key) => process.env[key]);
  try {
    for (const key of keys) delete process.env[key];
    process.env.DATABASE_URL = "postgres://test.invalid/credits";
    assert.equal(loadDatabaseConfig().databaseUrl, process.env.DATABASE_URL);
    assert.throws(loadHttpConfig, /USER_SERVICE_BASE_URL/);
    process.env.USER_SERVICE_BASE_URL = "http://user-service:3001";
    assert.deepEqual(loadHttpConfig(), { port: 3003, userService: { baseUrl: "http://user-service:3001", timeoutMs: 1000 } });
    for (const [key, value] of [
      ["PORT", "0"], ["PORT", "65536"], ["PORT", "1.5"],
      ["USER_SERVICE_VERIFY_TIMEOUT_MS", "0"], ["USER_SERVICE_VERIFY_TIMEOUT_MS", "60001"],
      ["USER_SERVICE_BASE_URL", "file:///auth"], ["USER_SERVICE_BASE_URL", "http://name:password@host"],
    ]) {
      const previous = process.env[key];
      process.env[key] = value;
      assert.throws(loadHttpConfig);
      if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
    }
  } finally {
    keys.forEach((key, index) => {
      if (original[index] === undefined) delete process.env[key]; else process.env[key] = original[index];
    });
  }
});
