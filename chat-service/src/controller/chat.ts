import { Buffer } from "node:buffer";
import type { Context } from "@oak/oak";
import config from "../config.ts";
import log from "../log.ts";
import type { AuthenticatedUser } from "../middleware/auth.ts";
import {
    findImage,
    findMessageByClientId,
    findSession,
    insertMessage,
    listChatsFor,
    listMessages,
    markRead as markChatRead,
    type ChatSession,
    type Message,
    type NewMessage,
} from "../prisma/chats.ts";
import { chatDto, messageDto, pushMessage } from "../realtime/events.ts";
import { clientMessageIdSchema, type ListMessagesQuery, type SendTextBody } from "../schema/chat.ts";

const respond = (ctx: Context, status: number, body: Context["response"]["body"]) => {
    ctx.response.status = status;
    ctx.response.body = body;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// the same answer for "no such chat", "not your chat" and "already deleted", so nobody can
// find out which errands have a chat
const notFound = (ctx: Context) => respond(ctx, 404, { error: "chat not found" });

type ParamsContext = Context & { params: Record<string, string | undefined> };

/**
 * The chat for ctx.params.errandId if the signed-in user is its requester or its courier and it
 * is complete and not past its deletion time. Otherwise answers 404 and returns null.
 * The user comes from the access token and the two participants from the stored chat, never
 * from anything the client sends.
 */
const requireParticipantSession = async (ctx: ParamsContext): Promise<ChatSession | null> => {
    const user = <AuthenticatedUser>ctx.state.user;
    const errandId = ctx.params.errandId ?? "";
    if (!UUID.test(errandId)) {
        notFound(ctx);
        return null;
    }
    const session = await findSession(errandId);
    const isParticipant = session !== null
        && session.requesterId !== null && session.courierId !== null
        && (session.requesterId === user.id || session.courierId === user.id);
    if (!session || !isParticipant) {
        notFound(ctx);
        return null;
    }
    return session;
};

/** GET /chats: the signed-in user's chats, most recently active first */
export const fetchChats = async (ctx: Context) => {
    const user = <AuthenticatedUser>ctx.state.user;
    const chats = await listChatsFor(user.id);
    respond(ctx, 200, { data: chats.map(c => chatDto(c, user.id)) });
};

/** GET /chats/:errandId */
export const fetchChat = async (ctx: ParamsContext) => {
    const user = <AuthenticatedUser>ctx.state.user;
    const session = await requireParticipantSession(ctx);
    if (!session) return;
    const [chat] = await listChatsFor(user.id, session.errandId);
    if (!chat) return notFound(ctx);
    respond(ctx, 200, chatDto(chat, user.id));
};

/**
 * GET /chats/:errandId/messages?limit=30&before=<messageId>
 * Oldest first; `hasMore` says whether older messages exist before the first one returned.
 */
export const fetchMessages = async (ctx: ParamsContext) => {
    const session = await requireParticipantSession(ctx);
    if (!session) return;
    const query = <ListMessagesQuery>ctx.state.validatedQuery;
    const page = await listMessages(session.errandId, query.before ?? null, query.limit);
    respond(ctx, 200, { data: page.data.map(messageDto), hasMore: page.hasMore });
};

/**
 * Saves a message and pushes it to both people. A repeated clientMessageId from the same sender
 * returns the first message (200) and pushes nothing, so a retry never duplicates a message.
 */
const saveMessage = async (ctx: Context, session: ChatSession, message: NewMessage) => {
    const saved = await insertMessage(message);
    if (saved) {
        pushMessage(session, saved);
        return respond(ctx, 201, messageDto(saved));
    }
    const existing: Message | null = await findMessageByClientId(message.clientMessageId);
    if (!existing)
        return notFound(ctx); // the chat was deleted a moment ago
    if (existing.errandId !== message.errandId || existing.senderId !== message.senderId)
        return respond(ctx, 409, { error: "clientMessageId is already used by another message" });
    respond(ctx, 200, messageDto(existing));
};

/** POST /chats/:errandId/messages */
export const sendText = async (ctx: ParamsContext) => {
    const user = <AuthenticatedUser>ctx.state.user;
    const session = await requireParticipantSession(ctx);
    if (!session) return;
    const body = <SendTextBody>ctx.state.validatedBody;
    await saveMessage(ctx, session, {
        errandId: session.errandId,
        senderId: user.id,
        type: "TEXT",
        body: body.body,
        imageMime: null,
        imageData: null,
        clientMessageId: body.clientMessageId,
    });
};

// the first bytes of each allowed image type; the type is decided from the bytes, never from
// the file name or the type the browser claims
const sniffImageType = (b: Uint8Array): string | null => {
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
        return "image/jpeg";
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (b.length >= png.length && png.every((v, i) => b[i] === v))
        return "image/png";
    const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
    if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP")
        return "image/webp";
    return null;
};

/**
 * POST /chats/:errandId/images  (multipart/form-data: image = the file, clientMessageId = a UUID)
 * 413 if the image is over the size limit, 415 if it is not a JPEG, PNG or WebP.
 */
export const sendImage = async (ctx: ParamsContext) => {
    const user = <AuthenticatedUser>ctx.state.user;
    const session = await requireParticipantSession(ctx);
    if (!session) return;

    let form: FormData;
    try {
        form = await ctx.request.body.formData();
    } catch {
        return respond(ctx, 400, { error: "request expected multipart/form-data" });
    }

    const file = form.get("image");
    const idResult = clientMessageIdSchema.safeParse(form.get("clientMessageId"));
    const fields: Record<string, string[]> = {};
    if (!(file instanceof File)) fields.image = ["Image is required"];
    if (!idResult.success) fields.clientMessageId = ["Must be a UUID"];
    if (!(file instanceof File) || !idResult.success)
        return respond(ctx, 400, { error: "invalid request body", fields });

    if (file.size > config.chat.maxImageBytes)
        return respond(ctx, 413, { error: `image is too large (max ${config.chat.maxImageBytes / 1024 / 1024} MB)` });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = sniffImageType(bytes);
    if (!mime)
        return respond(ctx, 415, { error: "only JPEG, PNG or WebP images are allowed" });

    await saveMessage(ctx, session, {
        errandId: session.errandId,
        senderId: user.id,
        type: "IMAGE",
        body: null,
        imageMime: mime,
        imageData: Buffer.from(bytes).toString("base64"),
        clientMessageId: idResult.data,
    });
};

/** POST /chats/:errandId/read: marks everything in the chat as read for the signed-in user */
export const markRead = async (ctx: ParamsContext) => {
    const user = <AuthenticatedUser>ctx.state.user;
    const session = await requireParticipantSession(ctx);
    if (!session) return;
    await markChatRead(session.errandId, user.id);
    ctx.response.status = 204;
};

/** GET /images/:messageId: the image bytes, only for the two people in that chat */
export const fetchImage = async (ctx: ParamsContext) => {
    const user = <AuthenticatedUser>ctx.state.user;
    const id = Number(ctx.params.messageId);
    if (!Number.isInteger(id) || id <= 0) return notFound(ctx);

    const image = await findImage(id);
    const session = image ? await findSession(image.errandId) : null;
    const isParticipant = session !== null && (session.requesterId === user.id || session.courierId === user.id);
    if (!image || !session || !isParticipant) return notFound(ctx);

    log.debug(`image ${id} served to user ${user.id}`);
    ctx.response.type = image.mime;
    ctx.response.headers.set("Cache-Control", "private, max-age=3600");
    ctx.response.body = new Uint8Array(Buffer.from(image.data, "base64"));
};
