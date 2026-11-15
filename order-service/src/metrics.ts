/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-18
 * Scope: In-process counters for the Kafka integration (outbox backlog and latency, consumer
 *        retries and DLQ) and a periodic log line with them.
 * Author review: Reviewed and approved by @phuc
 */
import { METRICS_INTERVAL_MS } from "./config";
import { errorMessage, log } from "./log";

// Counters since the process started. Latencies are the last and the largest seen.
const counters = {
  outboxPublished: 0,
  outboxBatches: 0,
  outboxPublishFailures: 0,
  outboxLastLatencyMs: 0,
  outboxMaxLatencyMs: 0,
  resultsProcessed: 0,
  resultsDuplicates: 0,
  resultsRetries: 0,
  resultsOutageRetries: 0,
  resultsDeadLettered: 0,
  resultsLastLagMs: 0,
  resultsMaxLagMs: 0,
};

export type Counter = Exclude<keyof typeof counters, `${string}LatencyMs` | `${string}LagMs`>;

export const metrics = {
  increment(name: Counter, by = 1): void {
    counters[name] += by;
  },
  /** Time from an outbox row's commit to Kafka's acknowledgement of it. */
  publishLatency(ms: number): void {
    counters.outboxLastLatencyMs = ms;
    counters.outboxMaxLatencyMs = Math.max(counters.outboxMaxLatencyMs, ms);
  },
  /** Time from a credit.results reply's Kafka timestamp to the end of its handling. */
  resultLag(ms: number): void {
    counters.resultsLastLagMs = ms;
    counters.resultsMaxLagMs = Math.max(counters.resultsMaxLagMs, ms);
  },
  snapshot(): Readonly<typeof counters> {
    return { ...counters };
  },
  /** For tests. */
  reset(): void {
    for (const k of Object.keys(counters) as (keyof typeof counters)[]) counters[k] = 0;
  },
};

/** Logs the counters and the outbox backlog every METRICS_INTERVAL_MS until stopped. */
export function startMetricsReporter(backlog: () => Promise<Record<string, number>>): { stop(): void } {
  const timer = setInterval(() => {
    backlog()
      .then((pending) => log.info("credit_kafka_metrics", { ...metrics.snapshot(), ...pending }))
      .catch((err) => log.warn("credit_kafka_metrics_failed", { error: errorMessage(err) }));
  }, METRICS_INTERVAL_MS);
  timer.unref();
  return { stop: () => clearInterval(timer) };
}
