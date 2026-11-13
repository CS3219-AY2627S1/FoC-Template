import type { Request, Response } from "express";
import type { ZodError } from "zod";
import { AppError } from "../errors.ts";
import { socketServer } from "../index.ts";
import { ConversationQuerySchema, OrderParamsSchema, SendMessageSchema } from "../schemas/message.schema.ts";
import { checkCanChat, checkErrandParticipant } from "../services/errand.service.ts";
import { createMessage, getConversation, getErrandConversation, getLastMessageBetween, listConversations } from "../services/message.service.ts";

function validationFailed(res: Response, error: ZodError) {
    return res.status(400).json({
        error: {
            code: "VALIDATION_FAILED",
            message: "One or more fields are invalid",
            details: {
                fields: error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
            },
        },
    });
}

function sendAppError(res: Response, err: unknown) {
    if (!(err instanceof AppError)) throw err;
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
}

export async function getConversations(_req: Request, res: Response) {
    return res.status(200).json(await listConversations(res.locals.accountId));
}

export async function getLastByUserId(req: Request, res: Response) {
    const accountId: string = res.locals.accountId;
    const otherId = req.params.userId as string;

    return res.status(200).json(await getLastMessageBetween(accountId, otherId));
}

export async function getConversationByIds(req: Request, res: Response) {
    const accountId: string = res.locals.accountId;
    const senderId = req.params.senderId as string;
    const receiverId = req.params.receiverId as string;

    // Refused before the lookup, so the answer does not reveal whether the two have talked.
    if (senderId !== accountId && receiverId !== accountId) {
        return res.status(403).json({ error: { code: "FORBIDDEN", message: "You are not allowed to do this" } });
    }

    const parsed = ConversationQuerySchema.safeParse(req.query);
    if (!parsed.success) return validationFailed(res, parsed.error);

    const otherId = senderId === accountId ? receiverId : senderId;
    return res.status(200).json(await getConversation(accountId, otherId, parsed.data.page, parsed.data.pageSize));
}

export async function send(req: Request, res: Response) {
    const parsed = SendMessageSchema.safeParse(req.body);
    if (!parsed.success) return validationFailed(res, parsed.error);

    const { orderId, receiverId, content } = parsed.data;
    // The sender is whoever the user-service says is logged in, never what the body claims.
    const senderId: string = res.locals.accountId;
    try {
        await checkCanChat(orderId, senderId, receiverId);
    } catch (err) {
        return sendAppError(res, err);
    }

    const message = await createMessage(senderId, receiverId, orderId, content);
    // Same as a message sent over the socket, so the receiver sees it without reloading.
    socketServer.sendToUser(receiverId, "receiveMessage", message);
    return res.status(201).json(message);
}

// The chat of one errand, readable by its requester and courier even after it has closed.
export async function getErrandChat(req: Request, res: Response) {
    const params = OrderParamsSchema.safeParse(req.params);
    if (!params.success) return validationFailed(res, params.error);
    const query = ConversationQuerySchema.safeParse(req.query);
    if (!query.success) return validationFailed(res, query.error);

    let access;
    try {
        access = await checkErrandParticipant(params.data.orderId, res.locals.accountId);
    } catch (err) {
        return sendAppError(res, err);
    }

    const conversation = await getErrandConversation(params.data.orderId, query.data.page, query.data.pageSize);
    return res.status(200).json({ ...conversation, otherId: access.counterpart, open: access.open });
}
