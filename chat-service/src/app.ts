/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-07
 * Scope: Implemented the team-specified chat creation endpoint and supporting scaffold.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented conversation listing.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented the team-specified message sending and realtime delivery.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented the team-specified read receipt endpoint.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented the team-specified system notification endpoint.
 * Author review: tng wen xi
 * Scope (2026-11-09, Codex, model: GPT-6): Mounted the approved order-service-compatible health route.
 * Author review: tng wen xi
 * Scope (2026-11-09, Claude Code, model: claude-sonnet-5-5): Implemented the team-specified message translation (toggle, queue, translated content, completion event).
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 */
import type { TokenVerifier } from "./middleware/authenticate.js";
import express from "express";
import { healthRouter } from "./routes/health.routes.js";
import type { PrismaClient } from "./db/prisma.js";
import {
  conversationsRouter,
  systemNotificationsRouter,
} from "./routes/conversations.routes.js";
export function createApp({
  prisma,
  apiKey,
  userServiceUrl = "http://user-service:3001",
  verifyToken,
  publish,
  publishRead,
  enqueueTranslation,
}: {
  prisma: PrismaClient;
  apiKey: string;
  userServiceUrl?: string;
  verifyToken?: TokenVerifier;
  publishRead?: import("./realtime/messages.js").ReadPublisher;
  publish?: import("./realtime/messages.js").MessagePublisher;
  enqueueTranslation?: import("./translation/queue.js").TranslationEnqueuer;
}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());
  // AI-generated
  app.use("/health", healthRouter(prisma));
  app.use(
    "/chat/conversations",
    conversationsRouter(
      prisma,
      apiKey,
      userServiceUrl,
      verifyToken,
      publish,
      publishRead,
      enqueueTranslation,
    ),
  );
  // AI-generated
  app.use(
    "/chat",
    systemNotificationsRouter(
      prisma,
      apiKey,
      userServiceUrl,
      verifyToken,
      publish,
      enqueueTranslation,
    ),
  );
  return app;
}
