/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-08
 * Scope: Implemented requested frontend linkage using the existing chat API contracts.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented or verified marking displayed chat messages as read.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Added or tested a total unread badge on the top chat icon.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-09, Claude Code, model: claude-sonnet-5-5): Added setTranslation for POST /chat/conversations/:id/translation.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-10, Codex, model: GPT-6): Implemented or tested requested active/archived chat list tabs using the existing status filter.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Resolved merge conflicts.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { request } from "./http";

export const encodeCursor = (cursor) =>
  cursor ? btoa(JSON.stringify(cursor)) : undefined;
// AI-generated
export const listChats = (role, cursor, status) =>
  request("/chat/conversations", {
    query: {
      role,
      cursor: encodeCursor(cursor),
      ...(status ? { status } : {}),
    },
  });
export const getChat = (id) =>
  request("/chat/conversations/" + encodeURIComponent(id));
export const listMessages = (id, cursor) =>
  request("/chat/conversations/" + encodeURIComponent(id) + "/messages", {
    query: { cursor: encodeCursor(cursor) },
  });
export const sendMessage = (id, content) =>
  request("/chat/conversations/" + encodeURIComponent(id) + "/messages", {
    method: "POST",
    json: { type: "TEXT", content },
  });

// Orders and conversations have different IDs. Follow the existing list cursor to find the order.
export async function findOrderChat(orderId, role) {
  let cursor;
  do {
    const page = await listChats(role, cursor);
    const chat = page.conversations.find((item) => item.orderId === orderId);
    if (chat) return chat;
    cursor = page.hasMore ? page.nextCursor : null;
  } while (cursor);
  throw new Error("Chat is not available yet. Please try again shortly.");
}

export const markMessagesRead = async (id, lastReadMessageId) => {
  const receipt = await request(
    "/chat/conversations/" + encodeURIComponent(id) + "/read",
    {
      method: "POST",
      json: { lastReadMessageId },
    },
  );
  window.dispatchEvent(new Event("chat-read-updated"));
  return receipt;
};

// AI-generated (edited by <name>).
// body: { enabled: false } or { enabled: true, language }. 200 { conversationId, userId, translateTo }.
export const setTranslation = (id, body) =>
  request("/chat/conversations/" + encodeURIComponent(id) + "/translation", {
    method: "POST",
    json: body,
  });
