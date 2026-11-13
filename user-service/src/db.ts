import mongoose from "mongoose";
import { config } from "./config.ts";
import { logger } from "./lib/logger.ts";

const MAX_ATTEMPTS = 10;

export async function connectWithRetry(): Promise<void> {
    for (let attempt = 1;; attempt++) {
        try {
            await mongoose.connect(config.MONGO_URL, { serverSelectionTimeoutMS: 5000 });
            logger.info("connected to MongoDB");
            return;
        } catch (err) {
            if (attempt >= MAX_ATTEMPTS) throw err;
            // exponential backoff delay for retry
            const delayMs = Math.min(1000 * 2 ** (attempt - 1), 10_000);
            logger.warn({ attempt, delayMs }, "MongoDB not reachable, retrying");
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }
}

export function isDbConnected(): boolean {
    return mongoose.connection.readyState === 1;
}