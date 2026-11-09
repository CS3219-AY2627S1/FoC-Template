/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-30
 * Scope: Service bootstrap (catalog seed, Kafka, listen), modelled on rating-service.
 *        2026-11-02: no schedule; a changed catalog triggers a one-off re-check.
 * Reviewed by Ngooi Jun Sen
 */

import { buildApp } from './app.js';
import catalogSeed from './catalog/badges.json' with { type: 'json' };
import { config } from './config.js';
import { queryClient } from './database/index.js';
import { startMessaging } from './messaging/kafka.js';
import { seedCatalog } from './services/catalog.service.js';
import { recheckAll } from './services/recheck.service.js';
import type { BadgeDefinition } from './types.js';

const app = buildApp();
let stopMessaging: (() => Promise<void>) | undefined;

async function start(): Promise<void> {
  try {
    // The schema itself is migrated by the migrate Job (ADR-0011) before this starts.
    const catalogChanged = await seedCatalog(catalogSeed as BadgeDefinition[]);

    await app.listen({ host: config.host, port: config.port });

    // Events keep badges current; only a new or changed badge needs everyone
    // re-checked. In the background, so the health probes answer meanwhile.
    if (catalogChanged) {
      recheckAll()
        .then((summary) => app.log.info({ summary }, 'catalog changed: badges re-checked'))
        .catch((err: unknown) => app.log.error({ err }, 'badge re-check after a catalog change failed'));
    }
    if (config.kafka.brokers.length > 0) {
      stopMessaging = await startMessaging(app.log);
    } else {
      app.log.warn('KAFKA_BROKERS is not set: badges will not change');
    }
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

async function shutdown(signal: string): Promise<void> {
  app.log.info(`received ${signal}, shutting down`);
  try {
    await stopMessaging?.();
    await app.close();
    await queryClient.end({ timeout: 5 });
  } finally {
    process.exit(0);
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

void start();
