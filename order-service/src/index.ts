import { createApp } from "./app.ts";
import { config } from "./config.ts";
import { connectWithRetry, initializeSchema, pool } from "./db.ts";
import { logger } from "./lib/logger.ts";
import { closeBroker, publishEvent } from "./broker.ts";
import { startOutboxRelay } from "./services/outbox.ts";

try {
    await connectWithRetry();
    await initializeSchema();
} catch (err) {
    logger.fatal({ err }, "Could not connect to database, exiting");
    process.exit(1);
}

const app = createApp();
const stopRelay = startOutboxRelay(pool, publishEvent, (err) => logger.warn({ err }, "credit events are waiting"));
const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, "Order Service listening");
});

async function shutdown(signal: string) {
    logger.info({ signal }, "Shutting down Order Service");
    await new Promise((resolve) => server.close(resolve));
    await stopRelay();
    await closeBroker();
    await pool.end();
    process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
