/* Additional AI assistance: OpenAI Codex (GPT-6), 2026-11-09.
 * Scope: HTTP history configuration for #58. Author review: Pending. */
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Configuration module following the User Service pattern (every environment variable
 *        read in one place), with the Credit Service's settings from implementation-proposal.md.
 * Author review: Reviewed and approved by @phuc
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Kafka settings (brokers, topics including the DLQs, consumer group, retry count,
 *        outbox publisher timings), per the author's decisions.
 * Author review of additional changes: Reviewed and approved by @phuc
 */

// The only file that reads process.env. Each part loads only what it needs, so the
// migration runner (which needs just DATABASE_URL) does not require the other settings.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

export function loadDatabaseConfig() {
  return { databaseUrl: required("DATABASE_URL") };
}

export function loadCreditConfig() {
  const grant = Number(process.env.INITIAL_CREDIT_GRANT ?? 100);
  if (!Number.isSafeInteger(grant) || grant < 0) {
    throw new Error("INITIAL_CREDIT_GRANT must be a whole number >= 0");
  }
  return { initialCreditGrant: grant };
}

export function loadHttpConfig() {
  const bounded = (name: string, fallback: number, max: number) => {
    const text = process.env[name] ?? String(fallback);
    const value = Number(text);
    if (!/^\d+$/.test(text) || !Number.isSafeInteger(value) || value < 1 || value > max) {
      throw new Error(`${name} must be an integer from 1 to ${max}`);
    }
    return value;
  };
  const baseUrl = required("USER_SERVICE_BASE_URL");
  const url = new URL(baseUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("USER_SERVICE_BASE_URL must be an HTTP(S) URL without credentials, query or fragment");
  }
  return {
    port: bounded("PORT", 3003, 65535),
    userService: { baseUrl, timeoutMs: bounded("USER_SERVICE_VERIFY_TIMEOUT_MS", 1000, 60000) },
  };
}

export function loadKafkaConfig() {
  return {
    brokers: required("KAFKA_BROKERS").split(",").map((b) => b.trim()).filter(Boolean),
    clientId: process.env.KAFKA_CLIENT_ID || "credit-service",
  };
}

// Kafka topics (decision D9; created by kafka/create-topics.sh)
export const TOPICS = {
  accountStatus: "user.account-status",
  commands: "credit.commands",
  results: "credit.results",
  // Dead-letter topics, one per consumed topic (implementation-proposal.md §7.3)
  accountStatusDlq: "user.account-status.dlq",
  commandsDlq: "credit.commands.dlq",
} as const;

// Kafka topic for replies to Order Service
export const CREDIT_RESULTS_TOPIC = TOPICS.results;

export const CONSUMER_GROUP = "credit-service";

// A message that keeps failing is retried in place this many times in total, then sent to
// its DLQ (author's decision). Database or Kafka outages are not counted: those messages are
// retried until the outage ends, because sending them to the DLQ would lose valid messages.
export const MESSAGE_RETRY = {
  maxAttempts: 5,
  initialDelayMs: 200,
  maxDelayMs: 5_000,
} as const;

// Outbox publisher (implementation-proposal.md §4.4)
export const OUTBOX = {
  batchSize: 100,
  retentionDays: 7,
  // How long the publisher waits after finding nothing to publish
  idlePollMs: 250,
  // How often published rows older than retentionDays are deleted
  cleanupIntervalMs: 60 * 60 * 1000,
} as const;

// Same values as User Service; kept here so they can be tuned in one place.
export const DB_RESILIENCE = {
  // Startup connection retries: 0.5 s, 1 s, 2 s, 4 s, 5 s, 5 s ...
  retryInitialDelayMs: 500,
  retryMultiplier: 2,
  retryMaxDelayMs: 5_000,
  retryGiveUpAfterMs: 60_000,
  poolConnectionTimeoutMs: 500,
} as const;
