/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-11-05
 * Scope: Generated implementation of Kafka topic provisioning with MSK authentication
 * Author review: Verified correctness of kafka config for replicas and partitions, verified that this works on AWS.
 */

import { Kafka } from 'kafkajs'

const mode = process.env.KAFKA_AUTH_MODE ?? 'none'
const auth = mode === 'scram'
  ? {
      ssl: true,
      sasl: {
        mechanism: 'scram-sha-512',
        username: process.env.KAFKA_USERNAME,
        password: process.env.KAFKA_PASSWORD,
      },
    }
  : {}
if (mode === 'scram' && (!process.env.KAFKA_USERNAME || !process.env.KAFKA_PASSWORD)) {
  throw new Error('KAFKA_USERNAME and KAFKA_PASSWORD are required for SCRAM')
}
const kafka = new Kafka({
  clientId: 'relay-topic-init',
  brokers: process.env.KAFKA_BROKERS.split(','),
  ...auth,
})
// MSK can report ACTIVE before a newly associated SCRAM user reaches every broker.
const deadline = Date.now() + 12 * 60_000
let admin
while (!admin) {
  const candidate = kafka.admin()
  try {
    await candidate.connect()
    admin = candidate
  } catch (error) {
    await candidate.disconnect().catch(() => undefined)
    if (Date.now() + 10_000 >= deadline) throw error
    console.error('Waiting for Kafka authentication and brokers:', error)
    await new Promise(resolve => setTimeout(resolve, 10_000))
  }
}
try {
  const replicationFactor = Number(process.env.KAFKA_REPLICATION_FACTOR ?? '1')
  const minIsr = Number(process.env.KAFKA_MIN_IN_SYNC_REPLICAS ?? '1')
  const partitionCount = Number(process.env.KAFKA_PARTITION_COUNT ?? '12')
  await admin.createTopics({
    waitForLeaders: true,
    topics: ['user-events', 'user-events-dlq', 'errand-events', 'errand-events-dlq']
      .map(topic => ({
        topic,
        numPartitions: partitionCount,
        replicationFactor,
        configEntries: [{ name: 'min.insync.replicas', value: String(minIsr) }],
      })),
  })
  // Existing topics must retain the same settings when a deployment is rerun.
  const existing = await admin.fetchTopicMetadata({ topics: ['user-events', 'user-events-dlq', 'errand-events', 'errand-events-dlq'] })
  for (const topic of existing.topics) {
    if (topic.partitions.length < partitionCount) {
      await admin.createPartitions({ topicPartitions: [{ topic: topic.name, count: partitionCount }] })
    }
  }
  const updated = await admin.fetchTopicMetadata({ topics: existing.topics.map(topic => topic.name) })
  for (const topic of updated.topics) {
    if (topic.partitions.length !== partitionCount) throw new Error(`${topic.name} has ${topic.partitions.length} partitions; expected ${partitionCount}`)
    for (const partition of topic.partitions) {
      if (partition.replicas.length !== replicationFactor) {
        throw new Error(`${topic.name} has ${partition.replicas.length} replicas; expected ${replicationFactor}`)
      }
    }
  }
} finally {
  await admin.disconnect()
}
