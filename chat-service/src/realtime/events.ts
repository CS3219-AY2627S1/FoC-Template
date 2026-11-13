// What the API returns for messages and chats, and the pushes sent over the WebSocket.
// Kept apart from the controller so the RabbitMQ handlers can push the same shapes.
import { listChatsFor, type ChatSession, type ChatSummary, type Message, type Participants } from "../prisma/chats.ts";
import { isConnected, sendToUser, sendToUsers } from "./hub.ts";

export const imageUrl = (messageId: number) => `/public/chat/images/${messageId}`;

export const messageDto = (m: Message) => ({
    id: m.id,
    errandId: m.errandId,
    senderId: m.senderId,
    type: m.type,
    body: m.body,
    // the app fetches this with its login token (or adds ?token=...)
    imageUrl: m.type === "IMAGE" ? imageUrl(m.id) : null,
    clientMessageId: m.clientMessageId,
    createdAt: m.createdAt,
});

/** A chat from one participant's point of view. */
export const chatDto = (c: ChatSummary, userId: number) => ({
    errandId: c.session.errandId,
    requesterId: c.session.requesterId,
    courierId: c.session.courierId,
    // the person this user is talking to
    otherUserId: userId === c.session.requesterId ? c.session.courierId : c.session.requesterId,
    // null while the errand is in progress; then DELIVERED or CANCELLED (which includes expired)
    endReason: c.session.endReason,
    // when the chat will be deleted; null while the errand is in progress
    deleteAt: c.session.deleteAt,
    unreadCount: c.unreadCount,
    lastMessage: c.lastMessage ? messageDto(c.lastMessage) : null,
    createdAt: c.session.createdAt,
});

export const pushMessage = (session: Pick<ChatSession, "requesterId" | "courierId">, message: Message): void =>
    sendToUsers([session.requesterId, session.courierId], { type: "message", message: messageDto(message) });

/** Tells both people about a chat that opened or changed, each with their own unread count. */
export const notifyChat = async (type: "chat.opened" | "chat.updated", session: ChatSession): Promise<void> => {
    for (const userId of new Set([session.requesterId, session.courierId])) {
        if (userId === null || !isConnected(userId)) continue;
        const [chat] = await listChatsFor(userId, session.errandId);
        if (chat) sendToUser(userId, { type, chat: chatDto(chat, userId) });
    }
};

export const notifyDeleted = (errandId: string, who: Participants): void =>
    sendToUsers([who.requesterId, who.courierId], { type: "chat.deleted", errandId });
