/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5)
 * Scope: Generated the topic-to-handler lookup shared by the consumer and the DLQ replay.
 * Reviewed by Ngooi Jun Sen.
 */

import { config } from '../config.js';
import { handleRatingCommand } from './grants.js';
import { handleUserEvent } from './userEvents.js';

// Which handler a topic's messages go to.
export function handlerFor(topic: string): ((raw: string) => Promise<string>) | undefined {
  if (topic === config.kafka.commandsTopic) return handleRatingCommand;
  if (topic === config.kafka.userTopic) return handleUserEvent;
  return undefined;
}
