import { z } from "zod";
import config from "../config.ts";

// made by the sender's app for each message (crypto.randomUUID()); sending the same id again is a
// retry and returns the first message instead of saving a second one
const clientMessageId = z.uuid({ error: "Must be a UUID" });

// body of POST /chats/:errandId/messages; the sender is taken from the access token, not the body
export const sendTextSchema = z.object({
    clientMessageId,
    body: z.string({ error: "Message is required" }).trim()
        .min(1, "Message cannot be empty")
        .max(config.chat.maxTextLength, `Must be at most ${config.chat.maxTextLength} characters`),
}).strict();

export type SendTextBody = z.infer<typeof sendTextSchema>;

// the text field of POST /chats/:errandId/images (the other field is the file)
export const clientMessageIdSchema = clientMessageId;

// query of GET /chats/:errandId/messages
export const listMessagesQuerySchema = z.object({
    // how many messages to return, newest first before they are put in time order
    limit: z.coerce.number().int().min(1).max(config.chat.maxPageSize).default(config.chat.defaultPageSize),
    // only messages before this message id, to load older ones
    before: z.coerce.number().int().positive().optional(),
}).strict();

export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
