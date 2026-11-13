import mongoose from "mongoose";
import { createApp } from "./app.ts";
import { config } from "./config.ts";
import { logger } from "./lib/logger.ts";
import SocketServer from "./webSocket.ts";
import { connectToDBWithRetry } from "./db.ts";
import { startMessageConsumer } from "./consumer.ts";
import Message from "./models/message.model.ts";

try {
    await connectToDBWithRetry();
    await Message.init();
    void startMessageConsumer();
} catch (err) {
    logger.fatal({ err }, "could not start, exiting");
    process.exit(1);
}


const server = createApp().listen(config.PORT, () => {
    logger.info(
        { port: config.PORT },
        "message-service listening"
    );
});

export const socketServer = new SocketServer(server);

async function shutdown(signal: string) {
    logger.info({ signal }, "shutting down");
    // Also closes the HTTP server. server.close() alone would wait forever on open sockets.
    await socketServer.close();
    await mongoose.disconnect();
    process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
