

import { Server, Socket } from "socket.io";
import type { Server as HttpServer } from "http";
import { logger } from "./lib/logger.ts";
import { cookieSocketEventMiddleware, cookieSocketMiddleware } from "./middleware/auth.ts";
import { MarkAsReadSchema, SendMessageSchema } from "./schemas/message.schema.ts";
import { AppError } from "./errors.ts";
import { checkCanChat } from "./services/errand.service.ts";
import { createMessage, markConversationAsRead } from "./services/message.service.ts";

class SocketServer {
    private io: Server;

    constructor(httpServer: HttpServer) {
        this.io = new Server(httpServer);
        this.io.use(cookieSocketMiddleware);
        this.initializeHandlers();
    }

    private initializeHandlers(): void {

        this.io.on("connection", (socket: Socket) => {
            // Always the id the user-service confirmed, never one the client sends.
            const accountId: string = socket.data.accountId;

            socket.use(cookieSocketEventMiddleware(socket));
            socket.join(accountId); // Join personal room for targeted emits

            socket.on('sendMessage', async (data, callback) => {
                const ack = typeof callback === 'function' ? callback : () => { };

                const parsed = SendMessageSchema.safeParse(data);
                if (!parsed.success) {
                    ack({ error: { code: "VALIDATION_FAILED", message: "One or more fields are invalid" } });
                    return;
                }

                const { orderId, receiverId, content } = parsed.data;
                try {
                    await checkCanChat(orderId, accountId, receiverId);
                    const message = await createMessage(accountId, receiverId, orderId, content);

                    // Emit to receiver's room (targeted)
                    this.io.to(receiverId).emit('receiveMessage', message);
                    // Ack back to sender
                    ack(message);
                } catch (err) {
                    if (err instanceof AppError) {
                        ack({ error: { code: err.code, message: err.message } });
                        return;
                    }
                    logger.error({ err }, "could not save message");
                    ack({ error: { code: "INTERNAL", message: "Could not send the message" } });
                }
            });

            socket.on('markAsRead', async (data, callback) => {
                const ack = typeof callback === 'function' ? callback : () => { };

                const parsed = MarkAsReadSchema.safeParse(data);
                if (!parsed.success) {
                    ack({ error: { code: "VALIDATION_FAILED", message: "One or more fields are invalid" } });
                    return;
                }

                try {
                    // Only a real change is announced, so nobody can tell a stranger their messages were read.
                    const { senderId, orderId } = parsed.data;
                    const changed = await markConversationAsRead(senderId, accountId, orderId);
                    if (changed > 0) this.io.to(senderId).emit('messagesRead', { readerId: accountId, orderId });
                    // The client reloads its unread counts once this arrives, so they never show the old state.
                    ack({ changed });
                } catch (err) {
                    logger.error({ err }, "could not mark messages as read");
                    ack({ error: { code: "INTERNAL", message: "Could not mark the messages as read" } });
                }
            });

            socket.on("heartbeat", () => {
                socket.emit("heartbeat:ack", {
                    timestamp: Date.now()
                });
            });

            // A refused event ends up here, see cookieSocketEventMiddleware.
            socket.on("error", () => socket.disconnect());

            socket.on("disconnect", () => {
                logger.info({ socketId: socket.id }, "Socket disconnected");
            });
        });
    }

    public close(): Promise<void> {
        return this.io.close();
    }

    public sendToUser(userId: string, event: string, payload: unknown): void {
        this.io.to(userId).emit(event, payload);
    }
}

export default SocketServer;
