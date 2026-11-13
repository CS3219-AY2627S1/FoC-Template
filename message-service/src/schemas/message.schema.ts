import { z } from "zod";
import { SYSTEM_SENDER_ID } from "../models/message.model.ts";

// Order ids are Postgres integers in the order-service.
const OrderIdSchema = z.string().trim().regex(/^\d{1,10}$/, "Must be an errand id");

// Long enough for any chat message; without a limit one socket event could store a megabyte.
export const MAX_CONTENT_LENGTH = 2000;

export const SendMessageSchema = z.object({
    orderId: OrderIdSchema,
    receiverId: z.string().trim().min(1).refine((id) => id !== SYSTEM_SENDER_ID, "Relay cannot receive messages"),
    content: z.string().trim().min(1).max(MAX_CONTENT_LENGTH),
});

export const MarkAsReadSchema = z.object({
    senderId: z.string().trim().min(1),
    // Marks only this errand's chat. Without it, every message from senderId counts as read.
    orderId: OrderIdSchema.optional(),
});

export const OrderParamsSchema = z.object({
    orderId: OrderIdSchema,
});

export const ConversationQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
