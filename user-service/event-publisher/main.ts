/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-11-03
 * Scope: Generated main.ts and startup and shutdown functions
 * Author review: Verified correctness.
 */

import { UserEventPublisher } from './user-event-publisher.js'
const publisher = new UserEventPublisher()
publisher.start()
async function stop() { await publisher.stop(); process.exit(0) }
process.once('SIGTERM', () => void stop())
process.once('SIGINT', () => void stop())
