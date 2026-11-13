import { Router } from "@oak/oak";
import {
    fetchChat,
    fetchChats,
    fetchImage,
    fetchMessages,
    markRead,
    sendImage,
    sendText,
} from "../controller/chat.ts";
import { authenticationMiddleware } from "../middleware/auth.ts";
import { validateBody, validateQuery } from "../middleware/schema.ts";
import { listMessagesQuerySchema, sendTextSchema } from "../schema/chat.ts";

// mounted under /public, so these are /public/chats/... (the gateway maps /public/chat/... to it)
const router = new Router();

// the signed-in user's chats, most recently active first
router.get("/chats", authenticationMiddleware(), fetchChats);

// one chat; 404 unless you are its requester or its courier
router.get("/chats/:errandId", authenticationMiddleware(), async ctx => { await fetchChat(ctx); });

// a page of messages, oldest first
router.get(
    "/chats/:errandId/messages",
    authenticationMiddleware(),
    validateQuery(listMessagesQuerySchema),
    async ctx => { await fetchMessages(ctx); },
);

// send a text message as the signed-in user
router.post(
    "/chats/:errandId/messages",
    authenticationMiddleware(),
    validateBody(sendTextSchema),
    async ctx => { await sendText(ctx); },
);

// send an image as the signed-in user (multipart/form-data)
router.post("/chats/:errandId/images", authenticationMiddleware(), async ctx => { await sendImage(ctx); });

// mark the chat as read for the signed-in user
router.post("/chats/:errandId/read", authenticationMiddleware(), async ctx => { await markRead(ctx); });

// image bytes; the token may also be given as ?token=... because an <img> tag cannot send headers
router.get("/images/:messageId", authenticationMiddleware({ allowQueryToken: true }), async ctx => { await fetchImage(ctx); });

export default router;
