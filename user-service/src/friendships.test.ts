/**
 * AI Assistance Disclosure
 * Tool: OpenAI Codex (GPT-5.6 Luna, GPT-5.6 Sol, GPT-6 Sol and GPT-6.1 Sol), 2026-09-25 to 2026-11-11.
 * Scope: Implementation and test assistance under author-finalized User Service requirements and architecture.
 * Author review: Josh Wang Kai Kiat validated correctness, edited where needed, and verified behavior/tests.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { friendshipAccountAvailable, parseFriendPage, parseFriendQuery, parseFriendshipId, parseRequestDirection } from "./friendships";
import { AppError } from "./errors";
import { openApiDocument } from "./openapi";

describe("friendship validation and account availability", () => {
  it("documents six bearer-protected paths without unresolved OpenAPI references", () => {
    const paths = Object.entries(openApiDocument.paths).filter(([path]) => path.includes("/friends"));
    assert.equal(paths.length, 6);
    for (const [, operations] of paths) {
      for (const operation of Object.values(operations)) {
        assert.deepEqual((operation as { security?: unknown }).security, [{ bearerAuth: [] }]);
      }
    }
    let references = 0;
    function walk(value: unknown): void {
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        if (key === "$ref" && typeof child === "string" && child.startsWith("#/")) {
          let target: unknown = openApiDocument;
          for (const part of child.slice(2).split("/")) {
            assert.ok(target && typeof target === "object", child);
            target = (target as Record<string, unknown>)[part];
          }
          assert.notEqual(target, undefined, child);
          references++;
        } else walk(child);
      }
    }
    walk(openApiDocument);
    assert.ok(references > 0);
  });
  it("accepts UUIDs and normalizes their case", () => {
    assert.equal(parseFriendshipId("5999FC1E-1496-45A0-AF8E-53EBF70669BA"), "5999fc1e-1496-45a0-af8e-53ebf70669ba");
    for (const value of [null, undefined, "bad", "", 1, {}, ["5999fc1e-1496-45a0-af8e-53ebf70669ba"]]) {
      assert.throws(() => parseFriendshipId(value), (error: unknown) => error instanceof AppError && error.status === 400);
    }
  });
  it("bounds pagination and rejects repeated or noninteger query parameters", () => {
    assert.deepEqual(parseFriendPage(undefined, undefined), { page: 1, pageSize: 20 });
    assert.deepEqual(parseFriendPage("100000", "100"), { page: 100000, pageSize: 100 });
    for (const value of ["0", "-1", "01", "1.5", "1e2", "100001", ["1"], {}, ""]) {
      assert.throws(() => parseFriendPage(value, undefined));
    }
    for (const value of ["0", "101", "01", "1.2", ["20"]]) assert.throws(() => parseFriendPage(undefined, value));
  });
  it("only supports incoming and outgoing pending request lists", () => {
    assert.equal(parseRequestDirection(undefined), "incoming");
    assert.equal(parseRequestDirection("outgoing"), "outgoing");
    for (const value of ["accepted", "INCOMING", "", ["incoming"]]) assert.throws(() => parseRequestDirection(value));
  });
  it("accepts a bounded optional friend-name query and uses pagination-style errors for invalid values", () => {
    for (const value of [undefined, "", "   "]) assert.equal(parseFriendQuery(value), "");
    assert.equal(parseFriendQuery(" LiM "), "LiM");
    assert.equal(parseFriendQuery("x".repeat(100)).length, 100);
    for (const value of ["x".repeat(101), " ".repeat(101), ["lim"], {}, null, 1]) {
      assert.throws(() => parseFriendQuery(value), (e: unknown) => e instanceof AppError
        && e.status === 400 && e.code === "INVALID_PAGINATION");
    }
  });
  it("excludes suspended and deletion-pending accounts without adding a verification requirement", () => {
    const active = { accessStatus: "ACTIVE" as const, deletionRequestedAt: null, scheduledDeletionAt: null };
    assert.equal(friendshipAccountAvailable(active), true);
    assert.equal(friendshipAccountAvailable({ ...active, accessStatus: "SUSPENDED" }), false);
    assert.equal(friendshipAccountAvailable({ ...active, deletionRequestedAt: new Date() }), false);
    assert.equal(friendshipAccountAvailable({ ...active, scheduledDeletionAt: new Date(Date.now() + 100000) }), false);
  });
});
