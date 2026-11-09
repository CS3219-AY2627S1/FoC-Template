/* AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-11-09.
 * Scope: Retriable Kafka startup independent of HTTP history for #58.
 * Author review: Pending. */
import { errorMessage, log } from "./log";

/** A failed connect/subscribe is cleaned up before retrying; HTTP stays available. */
export function startWorkers(deps: {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  startPublisher(): { stop(): Promise<void> };
  retryMs?: number;
}) {
  let stopping = false;
  let publisher: { stop(): Promise<void> } | undefined;
  let wake: (() => void) | undefined;
  const started = (async () => {
    while (!stopping) {
      try {
        await deps.connect();
        if (!stopping) publisher = deps.startPublisher();
        return;
      } catch (error) {
        await deps.disconnect();
        if (stopping) return;
        log.warn("kafka_start_retry", { error: errorMessage(error) });
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, deps.retryMs ?? 5000);
          wake = () => { clearTimeout(timer); resolve(); };
        });
        wake = undefined;
      }
    }
  })();
  return {
    async stop() {
      stopping = true;
      wake?.();
      await deps.disconnect();
      await started;
      await publisher?.stop();
      // A connect that finished concurrently with stop must also be disconnected.
      await deps.disconnect();
    },
  };
}
