/* Additional AI assistance: OpenAI Codex (GPT-6), 2026-11-09.
 * Scope: HTTP history and independent Kafka startup/shutdown for #58. Author review: Reviewed and approved by @phuc. */
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Service entry point: wait for the database, connect the Kafka producer, start the
 *        consumer and the outbox publisher, and shut down cleanly on SIGTERM/SIGINT.
 * Author review: Reviewed and approved by @phuc
 */
import { CONSUMER_GROUP, loadCreditConfig, loadHttpConfig } from "./config";
import { createHttpApp } from "./http";
import { HttpSessionVerifier } from "./sessionVerifier";
import { startWorkers } from "./lifecycle";
import type { Server } from "node:http";
import { createPool } from "./db";
import { retryWhileDatabaseUnavailable } from "./dbAvailability";
import { createKafka, createProducer, sendMessages, type Producer, type Consumer } from "./kafka";
import { errorMessage, log } from "./log";
import { startConsumer } from "./consumer";
import { startOutboxPublisher } from "./publisher";

async function main(): Promise<void> {
  loadCreditConfig(); // fail fast on a bad INITIAL_CREDIT_GRANT
  const httpConfig = loadHttpConfig();
  const pool = createPool();
  const kafka = createKafka();
  let producer: Producer | undefined;
  let consumer: Consumer | undefined;

  let server: Server | undefined;
  let workers: ReturnType<typeof startWorkers> | undefined;
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("shutdown", { signal });
    const deadline = setTimeout(() => process.exit(1), 15000);
    deadline.unref();
    // Stop accepting and drain HTTP before closing the shared pool.
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    await workers?.stop();
    await pool.end();
    clearTimeout(deadline);
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await retryWhileDatabaseUnavailable("Startup", () => pool.query("SELECT 1"));
  if (shuttingDown) return;
  const app = createHttpApp(pool, new HttpSessionVerifier(httpConfig.userService));
  await new Promise<void>((resolve, reject) => {
    server = app.listen(httpConfig.port, () => resolve());
    server.once("error", reject);
  });
  if (shuttingDown) return;
  log.info("http_started", { port: httpConfig.port });
  workers = startWorkers({
    async connect() {
      // The native Kafka clients cannot reconnect after disconnect(). Each failed
      // startup attempt therefore needs fresh clients, as in Order Service.
      const attemptProducer = createProducer(kafka);
      const attemptConsumer = kafka.consumer({
        kafkaJS: {
          groupId: CONSUMER_GROUP,
          fromBeginning: true,
          autoCommit: false,
          readUncommitted: false,
        },
      });
      producer = attemptProducer;
      consumer = attemptConsumer;
      await attemptProducer.connect();
      if (!shuttingDown) await startConsumer(attemptConsumer, { pool, send: (messages) => sendMessages(attemptProducer, messages) });
    },
    async disconnect() {
      await consumer?.disconnect().catch((err) => log.warn("consumer_disconnect_failed", { error: errorMessage(err) }));
      await producer?.disconnect().catch((err) => log.warn("producer_disconnect_failed", { error: errorMessage(err) }));
    },
    startPublisher: () => startOutboxPublisher(pool, producer!),
  });
}

main().catch((err) => {
  log.error("startup_failed", { error: errorMessage(err) });
  process.exit(1);
});
