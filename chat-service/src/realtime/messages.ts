/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-08
 * Scope: Implemented the team-specified message sending and realtime delivery.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented the team-specified read receipt endpoint.
 * Author review: tng wen xi
 * Scope (2026-11-09, Claude Code, model: claude-sonnet-5-5): Implemented the team-specified message translation (toggle, queue, translated content, completion event).
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 */
import type { Server } from "socket.io";
import type { sendMessage } from "../services/conversations.service.js";
export type SentMessage = NonNullable<
  Awaited<ReturnType<typeof sendMessage>>["message"]
>;
export type MessagePublisher = (
  message: SentMessage,
  userIds: string[],
) => void;
export function createMessagePublisher(io: Server): MessagePublisher {
  return (message, userIds) => {
    // One union broadcast delivers once even when a socket belongs to several rooms.
    io.to([
      `chat:${message.conversationId}`,
      ...userIds.map((id) => `user:${id}`),
    ]).emit("message:sent", message);
  };
}

// AI-generated
export type ReadReceipt = {
  conversationId: string;
  userId: string;
  lastReadMessageId: string;
};
export type ReadPublisher = (receipt: ReadReceipt) => void;
export function createReadPublisher(io: Server): ReadPublisher {
  return (receipt) => {
    io.to(`chat:${receipt.conversationId}`)
      .except(`user:${receipt.userId}`)
      .emit("messsage:read", receipt);
  };
}

// AI-generated (edited by <name>).
export type TranslatedMessage = {
  messageId: string;
  conversationId: string;
  userId: string;
  translatedContent: string;
};
export type TranslatedPublisher = (translated: TranslatedMessage) => void;
export function createTranslatedPublisher(io: Server): TranslatedPublisher {
  return ({ userId, ...payload }) => {
    // Only the user the translation was prepared for receives it.
    io.to(`user:${userId}`).emit("message:translated", payload);
  };
}
