/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-11-05
 * Scope: Generated main.ts and startup and shutdown functions
 * Author review: Verified correctness.
 */

import { Kafka } from 'kafkajs'
import { ErrandEventPublisher } from './errand-event-publisher.js'
import { ErrandRepository } from '../backend/src/repositories/errand.repository.js'
const mode = process.env.KAFKA_AUTH_MODE ?? 'none'
if (mode === 'scram' && (!process.env.KAFKA_USERNAME || !process.env.KAFKA_PASSWORD)) {
  throw new Error('KAFKA_USERNAME and KAFKA_PASSWORD are required for SCRAM')
}
const auth = mode === 'scram'
  ? { ssl: true, sasl: { mechanism: 'scram-sha-512' as const, username: process.env.KAFKA_USERNAME!, password: process.env.KAFKA_PASSWORD! } }
  : {}
const brokers = process.env.KAFKA_BROKERS
if (!brokers) throw new Error('KAFKA_BROKERS is required')
const kafka = new Kafka({ clientId: 'errand-event-publisher', brokers: brokers.split(','), retry: { retries: 3 }, ...auth })
const publisher = new ErrandEventPublisher(kafka, new ErrandRepository(), process.env.KAFKA_TOPIC_ERRAND_EVENTS ?? 'errand-events')
async function start() { while (true) { try { await publisher.start(); return } catch (error) { console.error(error); await new Promise(resolve => setTimeout(resolve, 5000)) } } }
void start()
async function stop() { await publisher.stop(); process.exit(0) }
process.once('SIGTERM', () => void stop())
process.once('SIGINT', () => void stop())
