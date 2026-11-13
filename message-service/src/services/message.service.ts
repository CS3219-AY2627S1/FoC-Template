import { socketServer } from "../index.ts"
import Message, { SYSTEM_SENDER_ID } from "../models/message.model.ts";

const DUPLICATE_KEY = 11000;

export async function messageUser(userId: string) {
    try {
        // Awaited so a failed save reaches the consumer, which then retries instead of acknowledging.
        const message = await Message.create({
            senderId: SYSTEM_SENDER_ID,
            receiverId: userId,
            content: "Welcome to relay. This is a platform where dreams come true. If your dreams involve getting food delivered and getting 50 free credits.",
        });

        socketServer.sendToUser(userId, "receiveMessage", message)
    } catch (err) {
        // A repeated event: the unique index already holds this account's welcome, so there is nothing to do.
        if ((err as { code?: number }).code !== DUPLICATE_KEY) throw err;
    }
}


function between(firstId: string, secondId: string) {
    return {
        $or: [
            { senderId: firstId, receiverId: secondId },
            { senderId: secondId, receiverId: firstId },
        ],
    };
}

export async function createMessage(senderId: string, receiverId: string, orderId: string, content: string) {
    return Message.create({ senderId, receiverId, orderId, content, status: "unread" });
}

export async function markConversationAsRead(senderId: string, receiverId: string, orderId?: string) {
    const filter: Record<string, string> = { senderId, receiverId, status: "unread" };
    if (orderId) filter.orderId = orderId;
    const result = await Message.updateMany(filter, { $set: { status: "read" } });
    return result.modifiedCount;
}

export async function getLastMessageBetween(firstId: string, secondId: string) {
    return Message.findOne(between(firstId, secondId)).sort({ createdAt: -1, _id: -1 });
}

// Page 1 is the newest messages, since a chat opens at its end. Each page reads oldest first.
export async function getConversation(firstId: string, secondId: string, page: number, pageSize: number) {
    const filter = between(firstId, secondId);
    const [newestFirst, total] = await Promise.all([
        Message.find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .skip((page - 1) * pageSize)
            .limit(pageSize),
        Message.countDocuments(filter),
    ]);

    return { items: newestFirst.reverse(), page, pageSize, total };
}

// The messages about one errand, paged like getConversation.
export async function getErrandConversation(orderId: string, page: number, pageSize: number) {
    const filter = { orderId };
    const [newestFirst, total] = await Promise.all([
        Message.find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .skip((page - 1) * pageSize)
            .limit(pageSize),
        Message.countDocuments(filter),
    ]);

    return { items: newestFirst.reverse(), page, pageSize, total };
}

// One row per errand chat the account takes part in, newest first, so the inbox needs a single
// request. Two people who share several errands get one row per errand, because each errand has
// its own chat that opens and closes with it. Messages from Relay have no errand and form one row.
export async function listConversations(accountId: string) {
    return Message.aggregate([
        { $match: { $or: [{ senderId: accountId }, { receiverId: accountId }] } },
        { $sort: { createdAt: -1, _id: -1 } },
        {
            $group: {
                _id: {
                    otherId: { $cond: [{ $eq: ["$senderId", accountId] }, "$receiverId", "$senderId"] },
                    orderId: "$orderId",
                },
                lastMessage: { $first: "$$ROOT" },
                unread: {
                    $sum: { $cond: [{ $and: [{ $eq: ["$receiverId", accountId] }, { $eq: ["$status", "unread"] }] }, 1, 0] },
                },
            },
        },
        { $sort: { "lastMessage.createdAt": -1, "lastMessage._id": -1 } },
        { $project: { _id: 0, otherId: "$_id.otherId", orderId: "$_id.orderId", lastMessage: 1, unread: 1 } },
    ]);
}
