import mongoose from "mongoose";
import { createApp } from "./app.ts";
import { config } from "./config.ts";
import { connectWithRetry } from "./db.ts";
import { logger } from "./lib/logger.ts";
import { ensureAdministrator, seedDemoStudents } from "./bootstrap.ts";
import { closeBroker } from "./broker.ts";
import { ensureAnnouncements, startAnnouncementRelay, stopAnnouncementRelay } from "./services/announcement.service.ts";

try {
    await connectWithRetry();
    await ensureAdministrator();
    if (config.SEED_DEMO_STUDENTS) await seedDemoStudents(config.SEED_DEMO_PASSWORD!);
    await ensureAnnouncements();
} catch(err) {
    logger.fatal({ err }, "could not start, exiting");
    process.exit(1);
}


const server = createApp().listen(config.PORT, () => {
    logger.info({ port: config.PORT }, "user-service listening");
})

// Runs on its own: the service starts and serves while the broker is down, and announcements wait.
startAnnouncementRelay();

async function shutdown(signal: string) {
    logger.info({ signal }, "shutting down");
    stopAnnouncementRelay();
    await new Promise((resolve) => server.close(resolve));
    await closeBroker();
    await mongoose.disconnect();
    process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));