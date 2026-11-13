import { createApp, createFeatureStore, createRecommendationLog, createTrainingLog, createWeightsProvider } from "./app.ts";
import { config } from "./config.ts";
import { logger } from "./lib/logger.ts";
import { startErrandConsumer } from "./consumer.ts";

const store = createFeatureStore();
const log = createRecommendationLog();
const training = createTrainingLog();
const weights = createWeightsProvider();

const server = createApp(store, log, weights).listen(config.PORT, () => {
    logger.info({ port: config.PORT, role: config.ROLE }, "recommendation-service listening");
});

if (config.ROLE !== "api") void startErrandConsumer(store, training);

async function shutdown(signal: string) {
    logger.info({ signal }, "shutting down");
    weights.stop();
    await log.stop();
    await training.stop();
    await new Promise((resolve) => server.close(resolve));
    process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
