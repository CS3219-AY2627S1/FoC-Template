/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-08
 * Scope: Implemented requested frontend linkage using the existing chat API contracts.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Verified message submission and added send-button feedback and regression tests.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented or verified marking displayed chat messages as read.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Verified existing status filters on chat list requests.
 * Author review: tng wen xi
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findOrderChat,
  listChats,
  markMessagesRead,
  sendMessage,
} from "../src/api/chat";
import { setAccessToken } from "../src/api/http";

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
});
const response = (body) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify(body),
});
describe("Chat HTTP requests", () => {
  it("sends the active role and bearer token", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(response({ conversations: [], hasMore: false }));
    vi.stubGlobal("fetch", fetch);
    setAccessToken("test-token");
    await listChats("courier");
    expect(fetch).toHaveBeenCalledWith(
      "/chat/conversations?role=courier",
      expect.objectContaining({
        headers: { Authorization: "Bearer test-token" },
      }),
    );
  });
  it("follows cursors to resolve an order without using its ID as a conversation ID", async () => {
    const cursor = { updatedAt: "2026-11-08T00:00:00.000Z", id: "cursor-id" };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response({ conversations: [], hasMore: true, nextCursor: cursor }),
      )
      .mockResolvedValueOnce(
        response({
          conversations: [{ id: "chat-id", orderId: "order-id" }],
          hasMore: false,
        }),
      );
    vi.stubGlobal("fetch", fetch);
    expect(await findOrderChat("order-id", "requester")).toEqual({
      id: "chat-id",
      orderId: "order-id",
    });
    const url = new URL(fetch.mock.calls[1][0], "http://localhost");
    expect(url.searchParams.get("role")).toBe("requester");
    expect(JSON.parse(atob(url.searchParams.get("cursor")))).toEqual(cursor);
  });
});

it("POSTs TEXT content to the send-message endpoint with the session bearer", async () => {
  const message = { messageId: "saved-message", content: "Hello courier" };
  const fetch = vi.fn().mockResolvedValue(response(message));
  vi.stubGlobal("fetch", fetch);
  setAccessToken("test-token");
  expect(await sendMessage("conversation-1", "Hello courier")).toEqual(message);
  expect(fetch).toHaveBeenCalledWith(
    "/chat/conversations/conversation-1/messages",
    expect.objectContaining({
      method: "POST",
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "TEXT", content: "Hello courier" }),
    }),
  );
});

it("POSTs the displayed read position with the session bearer", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(response({ lastReadMessageId: "message-1" }));
  vi.stubGlobal("fetch", fetch);
  setAccessToken("test-token");
  await markMessagesRead("conversation-1", "message-1");
  expect(fetch).toHaveBeenCalledWith(
    "/chat/conversations/conversation-1/read",
    expect.objectContaining({
      method: "POST",
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ lastReadMessageId: "message-1" }),
    }),
  );
});

// AI-generated
it("passes the existing archived status filter to the list endpoint", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(response({ conversations: [], hasMore: false }));
  vi.stubGlobal("fetch", fetch);
  await listChats("requester", undefined, "archived");
  expect(fetch).toHaveBeenCalledWith(
    "/chat/conversations?role=requester&status=archived",
    expect.anything(),
  );
});
