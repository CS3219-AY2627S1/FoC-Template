/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-07
 * Scope: Implemented the team-specified chat creation endpoint and supporting scaffold.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented conversation listing.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented the team-specified conversation details endpoint.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented the team-specified message listing endpoint.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented the team-specified message sending and realtime delivery.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented the team-specified read receipt endpoint.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented the team-specified participant addition endpoint.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented the team-specified system notification endpoint.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented or tested team-specified order-based courier participant delivery.
 * Author review: Congchen
 * Scope (2026-11-09, Claude Code, model: claude-sonnet-5-5): Implemented the team-specified message translation (toggle, queue, translated content, completion event).
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Implemented or tested team-specified order chat archiving after final notifications.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Resolved merge conflicts.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-10, Codex, model: GPT-6): Removed the conversation-ID participant endpoint per user instruction.
 * Author review: tng wen xi
 */
import { authenticateMessage } from "../middleware/authenticate-message.js";
import type { MessagePublisher } from "../realtime/messages.js";
import { Router } from "express";
import type { PrismaClient } from "../db/prisma.js";
import { authenticateService } from "../middleware/authenticate-service.js";
import {
  createAuthenticate,
  type TokenVerifier,
} from "../middleware/authenticate.js";
import {
  postArchive,
  postSystemNotification,
  postParticipant,
  postRead,
  postMessage,
  getConversation,
  getMessages,
  getConversations,
  postConversation,
  postTranslation,
} from "../controllers/conversations.controller.js";
export function conversationsRouter(
  prisma: PrismaClient,
  apiKey: string,
  userServiceUrl: string,
  verifyToken?: TokenVerifier,
  publish?: MessagePublisher,
  publishRead?: import("../realtime/messages.js").ReadPublisher,
  enqueueTranslation?: import("../translation/queue.js").TranslationEnqueuer,
) {
  const router = Router();
  router.get(
    "/",
    createAuthenticate(userServiceUrl, verifyToken),
    getConversations(prisma),
  );
  // AI-generated
  router.get(
    "/:conversationID",
    createAuthenticate(userServiceUrl, verifyToken),
    getConversation(prisma),
  );
  // AI-generated
  router.get(
    "/:conversationID/messages",
    createAuthenticate(userServiceUrl, verifyToken),
    getMessages(prisma),
  );
  // AI-generated
  router.post(
    "/:conversationID/messages",
    authenticateMessage(apiKey, userServiceUrl, verifyToken),
    postMessage(prisma, publish, enqueueTranslation),
  );
  // AI-generated
  router.post(
    "/:conversationID/read",
    createAuthenticate(userServiceUrl, verifyToken),
    postRead(prisma, publishRead),
  );
  // AI-generated
  router.post(
    "/:conversationID/translation",
    createAuthenticate(userServiceUrl, verifyToken),
    postTranslation(prisma, enqueueTranslation),
  );
  router.post("/", authenticateService(apiKey), postConversation(prisma));
  return router;
}

// AI-generated
export function systemNotificationsRouter(
  prisma: PrismaClient,
  apiKey: string,
  userServiceUrl: string,
  verifyToken?: TokenVerifier,
  publish?: MessagePublisher,
  enqueueTranslation?: import("../translation/queue.js").TranslationEnqueuer,
) {
  const router = Router();
  // AI-generated
  router.post(
    "/orders/:orderId/archive",
    authenticateMessage(apiKey, userServiceUrl, verifyToken),
    postArchive(prisma),
  );
  router.post(
    "/orders/:orderId/participants",
    authenticateMessage(apiKey, userServiceUrl, verifyToken),
    (req, res, next) => {
      if (req.user) {
        res.sendStatus(403);
        return;
      }
      next();
    },
    postParticipant(prisma),
  );
  router.post(
    "/send-system-notification",
    authenticateMessage(apiKey, userServiceUrl, verifyToken),
    (req, res, next) => {
      if (req.user) {
        res.sendStatus(403);
        return;
      }
      next();
    },
    postSystemNotification(prisma, publish, enqueueTranslation),
  );
  return router;
}
