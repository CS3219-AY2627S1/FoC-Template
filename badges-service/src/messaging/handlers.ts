/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: Moved the topic-to-handler lookup out of kafka.ts, so the failed-message
 *        replay can use it without starting a consumer.
 * Author review: Ngooi Jun Sen to validate before merge.
 */

import { config } from '../config.js';
import { handleAdminEvent } from './adminEvents.js';
import { handleOrderEvent } from './orderEvents.js';
import { handleRatingEvent } from './ratingEvents.js';

// Which handler a topic's messages go to.
export function handlerFor(topic: string): ((raw: string) => Promise<string>) | undefined {
  if (topic === config.kafka.orderTopic) return handleOrderEvent;
  if (topic === config.kafka.ratingTopic) return handleRatingEvent;
  if (topic === config.kafka.adminTopic) return handleAdminEvent;
  return undefined;
}
