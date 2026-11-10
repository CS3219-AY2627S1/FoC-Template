/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Service entry point: load the configuration, wait for the database, build the stub
 *        adapters, start the outbox publisher, deadline sweeper and HTTP server, and shut down
 *        cleanly on SIGTERM/SIGINT. Startup/shutdown pattern from credit-service/src/index.ts.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Rebuild the stub Credit holds from published outbox rows before the publisher starts.
 * Author review: Reviewed and approved by @mattis.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-18
* Scope: CREDIT_MODE=kafka: the Kafka publisher and credit.results consumer, connecting in the
 *        background, the metrics reporter, and an ordered, time-limited shutdown.
 * Author review of additional changes: Reviewed and approved by @phuc
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-18
 * Scope: AUTH_MODE=user-service builds UserServiceSessionVerifier.
 * Author review of additional changes: Reviewed and approved by @phuc
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-18
 * Scope: picks the HTTP or stub User and Supplier adapters by mode, per the User and Supplier
 *        integration plan.
 * Author review: Reviewed and approved by @mattis.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: loads the N2 LLM settings, builds the extraction dependencies and logs the mode (never the key),
 *        per the approved N2 spec.
 * Author review: Reviewed and approved by @mattis.
 */
import { StubCreditBus } from "./adapters/creditBus";
import { HttpSessionVerifier, StubSessionVerifier, type SessionVerifier } from "./adapters/sessionVerifier";
import { HttpSupplierDirectory, StubSupplierDirectory } from "./adapters/supplierDirectory";
import {
  loadAdapterConfig, loadDatabaseConfig, loadKafkaConfig, loadLlmConfig, loadOrderConfig, loadServerConfig, TOPICS,
} from "./config";
import { createPool } from "./db";
import { retryWhileDatabaseUnavailable } from "./dbAvailability";
import { startDeadlineSweeper } from "./deadlines/sweeper";
import { createApp } from "./http/app";
import { extractionDeps } from "./http/extractionRoutes";
import { createKafka, createProducer, SharedProducer } from "./kafka/client";
import { KafkaCreditPublisher } from "./kafka/creditPublisher";
import { startCreditResultsConsumer } from "./kafka/creditResultsConsumer";
import { errorMessage, log } from "./log";
import { startMetricsReporter } from "./metrics";
import { outboxBacklog, startOutboxPublisher, type MessagePublisher } from "./outbox";

// Compose sends SIGKILL 10 s after SIGTERM; finish before that
const SHUTDOWN_TIMEOUT_MS = 9_000;

type Stoppable = { name: string; stop(): Promise<void> | void };

async function main(): Promise<void> {
  // Fail fast on bad settings, before any connection is made
  loadDatabaseConfig();
  const order = loadOrderConfig();
  const adapters = loadAdapterConfig();
  const kafkaConfig = adapters.creditMode === "kafka" ? loadKafkaConfig() : undefined;
  const { port } = loadServerConfig();
  const llm = loadLlmConfig();

  const pool = createPool();
  await retryWhileDatabaseUnavailable("Startup", () => pool.query("SELECT 1"));

  // loadAdapterConfig only returns userService / supplierService in http mode
  const verifier: SessionVerifier = adapters.userService ? new HttpSessionVerifier(adapters.userService) : new StubSessionVerifier();
  const suppliers = adapters.supplierService ? new HttpSupplierDirectory(adapters.supplierService) : new StubSupplierDirectory();

  // Stopped in this order after the HTTP server: nothing new is read, then nothing new is sent
  const background: Stoppable[] = [];
  let creditPublisher: MessagePublisher;
  if (kafkaConfig) {
    // Nothing here waits for Kafka: the producer connects on first send and the consumer in the
    // background, both retrying, so HTTP and the database work while Kafka is down
    const kafka = createKafka(kafkaConfig);
    const producer = new SharedProducer(createProducer(kafka));
    creditPublisher = new KafkaCreditPublisher(producer);
    const consumer = startCreditResultsConsumer(kafka, {
      pool,
      sendToDlq: (messages) => producer.send(TOPICS.resultsDlq, messages),
    });
    background.push({ name: "consumer", stop: () => consumer.stop() });
    const publisher = startOutboxPublisher(pool, creditPublisher);
    const sweeper = startDeadlineSweeper(pool);
    const reporter = startMetricsReporter(() => outboxBacklog(pool));
    background.push(
      { name: "sweeper", stop: () => sweeper.stop() },
      // Together: disconnecting aborts a connect or send the publisher is waiting on, and an
      // unacknowledged batch stays unpublished for the next start
      { name: "publisher", stop: async () => void (await Promise.all([publisher.stop(), producer.disconnect()])) },
      { name: "metrics", stop: () => reporter.stop() },
    );
  } else {
    const stub = new StubCreditBus(pool, {
      limit: adapters.stubCreditLimit,
      delayMs: adapters.stubCreditDelayMs,
      silentAmount: adapters.stubCreditSilentAmount,
    });
    // The stub's holds live in memory; rebuild them from what was already published
    await stub.restore();
    creditPublisher = stub;
    const publisher = startOutboxPublisher(pool, creditPublisher);
    const sweeper = startDeadlineSweeper(pool);
    background.push({ name: "sweeper", stop: () => sweeper.stop() }, { name: "publisher", stop: () => publisher.stop() });
  }

  const extraction = extractionDeps(llm, suppliers);
  const server = createApp({ pool, verifier, suppliers, extraction }).listen(port, () => {
    log.info("order_service.started", {
      port,
      authMode: adapters.authMode,
      supplierMode: adapters.supplierMode,
      creditMode: adapters.creditMode,
      kafkaBrokers: kafkaConfig?.brokers,
      confirmationWindowMinutes: order.confirmationWindowMinutes,
      reservationTimeoutSeconds: order.reservationTimeoutSeconds,
      llmMode: llm.mode,
      llmModel: llm.model,
      extraction: extraction.status,
    });
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("order_service.shutdown", { signal });
    setTimeout(() => {
      log.error("order_service.shutdown_timeout", { afterMs: SHUTDOWN_TIMEOUT_MS });
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
    // Stop taking requests first, then the background work, then the database
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeIdleConnections();
    });
    for (const part of background) {
      await Promise.resolve()
        .then(() => part.stop())
        .catch((err) => log.warn(`${part.name}_stop_failed`, { error: errorMessage(err) }));
    }
    await pool.end().catch((err) => log.warn("pool_end_failed", { error: errorMessage(err) }));
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  log.error("startup_failed", { error: errorMessage(err) });
  process.exit(1);
});
