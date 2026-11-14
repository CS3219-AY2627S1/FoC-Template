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
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented or tested the team-specified order chat delivery and message ID deduplication.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented or tested team-specified order-based courier participant delivery.
 * Author review: tng wen xi
 * Scope (2026-11-09, Codex, model: GPT-6): Implemented or tested the team-specified system conversations.
 * Author review: tng wen xi
 * Scope (2026-11-09, Claude Code, model: claude-sonnet-5-5): Implemented the team-specified message translation (toggle, queue, translated content, completion event).
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-10, Codex, model: GPT-6): Implemented or tested team-specified order chat archiving after final notifications.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Implemented or verified user-specified order message actor fields and toast filtering.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Resolved merge conflicts.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-10, Codex, model: GPT-6): Combined existing translation and chat branch changes during merge resolution.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Removed the conversation-ID participant endpoint per user instruction.
 * Author review: tng wen xi
 */
import type { RequestHandler } from "express";
import { z } from "zod";
import { LANGUAGE_CODES } from "../translation/languages.js";
import type { TranslationEnqueuer } from "../translation/queue.js";
import type { PrismaClient } from "../db/prisma.js";
import {
  archiveOrderConversation,
  sendSystemNotification,
  addParticipant,
  markConversationRead,
  sendMessage,
  listConversations,
  listMessages,
  getConversationDetails,
  createConversation,
  setTranslation,
} from "../services/conversations.service.js";
const bodySchema = z.object({
  orderId: z.uuid(),
  requesterId: z.uuid(),
  orderDescription: z
    .string()
    .refine(
      (value) => value.trim().length > 0,
      "orderDescription must not be empty",
    ),
});
export function postConversation(prisma: PrismaClient): RequestHandler {
  return async (req, res) => {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid conversation creation request",
          details: parsed.error.issues.map((issue) => {
            const field = String(issue.path[0] ?? "body");
            return {
              field,
              message:
                req.body?.[field] === undefined
                  ? `${field} is required`
                  : issue.message,
            };
          }),
        },
      });
      return;
    }
    const result = await createConversation(prisma, parsed.data);
    if (result.conflict) {
      res.status(409).json({
        success: false,
        error: {
          code: "ORDER_ID_CONFLICT",
          message:
            "A conversation already exists for this order with different creation details",
        },
      });
      return;
    }
    const row = result.conversation;
    res.status(result.created ? 201 : 200).json({
      success: true,
      data: {
        conversationId: row.conversationId,
        orderId: row.orderId,
        title: row.title,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
      },
    });
  };
}

// AI-generated
const cursorSchema = z
  .object({ updatedAt: z.iso.datetime(), id: z.uuid() })
  .strict();
const querySchema = z
  .object({
    limit: z
      .string()
      .regex(/^[0-9]+$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(50))
      .default(20),
    cursor: z
      .string()
      .min(1)
      .transform((value, ctx) => {
        try {
          // Reject malformed base64 rather than relying on Buffer's permissive decoder.
          if (
            !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
              value,
            )
          )
            throw new Error();
          return cursorSchema.parse(
            JSON.parse(Buffer.from(value, "base64").toString("utf8")),
          );
        } catch {
          ctx.addIssue({ code: "custom", message: "Invalid cursor" });
          return z.NEVER;
        }
      })
      .optional(),
    status: z
      .enum(["active", "archived"])
      .transform((v) =>
        v === "active" ? ("ACTIVE" as const) : ("ARCHIVED" as const),
      )
      .optional(),
    role: z
      .enum(["courier", "requester"])
      .transform((v) =>
        v === "courier" ? ("COURIER" as const) : ("REQUESTER" as const),
      )
      .optional(),
  })
  .strict();
export function getConversations(prisma: PrismaClient): RequestHandler {
  return async (req, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        message: "Invalid conversation query parameters",
        code: "VALIDATION_ERROR",
      });
      return;
    }
    try {
      res
        .status(200)
        .json(await listConversations(prisma, req.user!.user_id, parsed.data));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal server error." });
    }
  };
}

// AI-generate
export function getConversation(prisma: PrismaClient): RequestHandler {
  return async (req, res) => {
    const parsed = z.uuid().safeParse(req.params.conversationID);
    if (!parsed.success) {
      res.sendStatus(400);
      return;
    }
    try {
      const result = await getConversationDetails(
        prisma,
        parsed.data,
        req.user!.user_id,
      );
      if (result === null) {
        res.sendStatus(404);
        return;
      }
      if (result === false) {
        res.sendStatus(403);
        return;
      }
      res.status(200).json(result);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal server error." });
    }
  };
}

// AI-generated
const messageCursorSchema = z
  .object({ createdAt: z.iso.datetime(), id: z.uuid() })
  .strict();
const messageQuerySchema = z
  .object({
    limit: z
      .string()
      .regex(/^[0-9]+$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(50))
      .default(20),
    cursor: z
      .string()
      .min(1)
      .transform((value, ctx) => {
        try {
          // Reject malformed base64 rather than relying on Buffer's permissive decoder.
          if (
            !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
              value,
            )
          )
            throw new Error();
          return messageCursorSchema.parse(
            JSON.parse(Buffer.from(value, "base64").toString("utf8")),
          );
        } catch {
          ctx.addIssue({ code: "custom", message: "Invalid cursor" });
          return z.NEVER;
        }
      })
      .optional(),
  })
  .strict();

export function getMessages(prisma: PrismaClient): RequestHandler {
  return async (req, res) => {
    const id = z.uuid().safeParse(req.params.conversationID);
    const query = messageQuerySchema.safeParse(req.query);
    if (!id.success || !query.success) {
      res.sendStatus(400);
      return;
    }
    try {
      const result = await listMessages(
        prisma,
        id.data,
        req.user!.user_id,
        query.data,
      );
      if (result === null) {
        res.sendStatus(404);
        return;
      }
      if (result === false) {
        res.sendStatus(403);
        return;
      }
      res.status(200).json(result);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal server error." });
    }
  };
}

// AI-generated
const sendMessageSchema = z.object({
  type: z.literal("TEXT"),
  content: z.string().refine((value) => value.trim().length > 0),
});
// Queues translations for recipients with auto-translate on; failures never affect the send.
function enqueueTranslations(
  enqueue: TranslationEnqueuer | undefined,
  message: { conversationId: string; messageId: string },
  targets: { userId: string; language: string }[] | undefined,
) {
  if (!enqueue || !targets?.length) return;
  enqueue(
    targets.map((target) => ({
      conversationId: message.conversationId,
      userId: target.userId,
      language: target.language as (typeof LANGUAGE_CODES)[number],
      messageIds: [message.messageId],
    })),
  ).catch((error) => console.error(error));
}
export function postMessage(
  prisma: PrismaClient,
  publish?: import("../realtime/messages.js").MessagePublisher,
  enqueue?: TranslationEnqueuer,
): RequestHandler {
  return async (req, res) => {
    const id = z.uuid().safeParse(req.params.conversationID);
    if (!id.success) {
      res.sendStatus(400);
      return;
    }
    try {
      const result = await sendMessage(
        prisma,
        id.data,
        req.user?.user_id ?? null,
        () => {
          if (req.user && req.body?.type === "SYSTEM") return 422;
          const parsed = sendMessageSchema.safeParse(req.body);
          return parsed.success ? parsed.data : 400;
        },
      );
      if (result.status !== 201) {
        res.sendStatus(result.status);
        return;
      }
      // The transaction has committed before any socket can receive this message.
      try {
        publish?.(result.message!, result.userIds!);
      } catch (error) {
        console.error(error);
      }
      enqueueTranslations(enqueue, result.message!, result.translateTargets);
      res.status(201).json(result.message);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal server error." });
    }
  };
}

// AI-generated
export function postRead(
  prisma: PrismaClient,
  publishRead?: import("../realtime/messages.js").ReadPublisher,
): RequestHandler {
  return async (req, res) => {
    const id = z.uuid().safeParse(req.params.conversationID);
    const body = z.object({ lastReadMessageId: z.uuid() }).safeParse(req.body);
    if (!id.success || !body.success) {
      res.sendStatus(400);
      return;
    }
    try {
      const result = await markConversationRead(
        prisma,
        id.data,
        req.user!.user_id,
        body.data.lastReadMessageId,
      );
      if (result.status !== 200) {
        res.sendStatus(result.status);
        return;
      }
      try {
        publishRead?.(result.receipt!);
      } catch (error) {
        console.error(error);
      }
      res.status(200).json(result.receipt);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal server error." });
    }
  };
}

// AI-generated
export function postParticipant(prisma: PrismaClient): RequestHandler {
  return async (req, res) => {
    const id = z.uuid().safeParse(req.params.orderId);
    const body = z
      .object({
        userId: z.uuid(),
        role: z.enum(["COURIER", "REQUESTER"]),
      })
      .safeParse(req.body);
    if (!id.success || !body.success) {
      res.sendStatus(400);
      return;
    }
    try {
      const result = await addParticipant(
        prisma,
        id.data,
        body.data,
      );
      if (result.status !== 200) {
        res.sendStatus(result.status);
        return;
      }
      res.status(200).json(result.participant);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal server error." });
    }
  };
}

// AI-generated
export function postSystemNotification(
  prisma: PrismaClient,
  publish?: import("../realtime/messages.js").MessagePublisher,
  enqueue?: TranslationEnqueuer,
): RequestHandler {
  return async (req, res) => {
    const body = z
      .object({
        orderId: z.uuid().nullable(),
        recipient: z.uuid().optional(),
        triggeredByUserId: z.uuid().optional(),
        messageId: z.uuid(),
        message: z.string().refine((value) => value.trim().length > 0),
      })
      .refine(
        (value) => value.orderId !== null || value.recipient !== undefined,
      )
      .refine(
        (value) =>
          value.triggeredByUserId === undefined || value.orderId !== null,
      )
      .safeParse(req.body);
    if (!body.success) {
      res.sendStatus(400);
      return;
    }
    try {
      const result = await sendSystemNotification(prisma, body.data);
      if (result.status !== 201 && result.status !== 200) {
        res.sendStatus(result.status);
        return;
      }
      // Reuse normal delivery only after the message transaction commits.
      try {
        if (result.status === 201) publish?.(result.message!, result.userIds!);
      } catch (error) {
        console.error(error);
      }
      if (result.status === 201)
        enqueueTranslations(enqueue, result.message!, result.translateTargets);
      res.status(result.status).json(result.message);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal server error." });
    }
  };
}

// AI-generated (edited by <name>).
const translationSchema = z.discriminatedUnion("enabled", [
  z.object({ enabled: z.literal(false) }),
  z.object({ enabled: z.literal(true), language: z.enum(LANGUAGE_CODES) }),
]);
export function postTranslation(
  prisma: PrismaClient,
  enqueue?: TranslationEnqueuer,
): RequestHandler {
  return async (req, res) => {
    const id = z.uuid().safeParse(req.params.conversationID);
    const body = translationSchema.safeParse(req.body);
    if (!id.success || !body.success) {
      res.sendStatus(400);
      return;
    }
    try {
      const result = await setTranslation(
        prisma,
        id.data,
        req.user!.user_id,
        body.data,
      );
      if (result.status !== 200) {
        res.sendStatus(result.status);
        return;
      }
      // Backfill every untranslated received message; a failed enqueue is logged only.
      if (body.data.enabled && enqueue)
        enqueue([
          {
            conversationId: id.data,
            userId: req.user!.user_id,
            language: body.data.language,
          },
        ]).catch((error) => console.error(error));
      res.status(200).json(result.translation);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal server error." });
    }
  };
}

// AI-generated (edited by <name>).
export function postArchive(prisma: PrismaClient): RequestHandler {
  return async (req, res) => {
    const id = z.uuid().safeParse(req.params.orderId);
    if (!id.success) {
      res.sendStatus(400);
      return;
    }
    try {
      const result = await archiveOrderConversation(
        prisma,
        id.data,
        req.user?.user_id,
      );
      res.sendStatus(result.status);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal server error." });
    }
  };
}
