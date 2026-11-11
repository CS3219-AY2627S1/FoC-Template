/**
 * AI Assistance Disclosure
 * Tool: OpenAI Codex (GPT-5.6 Luna, GPT-5.6 Sol, GPT-6 Sol and GPT-6.1 Sol), 2026-09-25 to 2026-11-11.
 * Scope: Implementation and test assistance under author-finalized User Service requirements and architecture.
 * Author review: Josh Wang Kai Kiat validated correctness, edited where needed, and verified behavior/tests.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LoggingUserEventPublisher } from "./events";
import {
  buildUserVerifiedEnvelope,
  buildUserDeletedEnvelope,
  KafkaUserEventPublisher,
  type MessageProducer,
} from "./kafka";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

describe("buildUserVerifiedEnvelope", () => {
  it("wraps userId and email in a UserVerified envelope", () => {
    const envelope = buildUserVerifiedEnvelope(
      { userId: USER_A, email: "a@u.nus.edu" },
      { eventId: "event-1", occurredAt: "2026-10-10T08:30:00.000Z" },
    );
    assert.deepEqual(envelope, {
      eventId: "event-1",
      type: "UserVerified",
      occurredAt: "2026-10-10T08:30:00.000Z",
      data: { userId: USER_A, email: "a@u.nus.edu" },
    });
  });

  it("defaults eventId to a UUID and occurredAt to an ISO timestamp", () => {
    const envelope = buildUserVerifiedEnvelope({ userId: USER_A, email: "a@u.nus.edu" });
    assert.match(
      envelope.eventId,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    assert.ok(!Number.isNaN(Date.parse(envelope.occurredAt)));
  });
});

describe("KafkaUserEventPublisher", () => {
  function recordingProducer() {
    const sent: { topic: string; messages: { key?: string; value: string }[] }[] = [];
    let connects = 0;
    const producer: MessageProducer = {
      connect: async () => {
        connects += 1;
      },
      disconnect: async () => undefined,
      send: async (record) => {
        sent.push(record);
        return [];
      },
    };
    return {
      producer,
      sent,
      connects: () => connects,
    };
  }

  it("connects once and sends a keyed UserVerified message to foc.user.status", async () => {
    const fake = recordingProducer();
    const publisher = new KafkaUserEventPublisher(fake.producer);

    await publisher.publishUserVerified({ userId: USER_A, email: "a@u.nus.edu" });
    await publisher.publishUserVerified({ userId: USER_B, email: "b@u.nus.edu" });

    assert.equal(fake.connects(), 1, "connects once and reuses the connection");
    assert.equal(fake.sent.length, 2);

    const first = fake.sent[0];
    assert.equal(first.topic, "foc.user.status");
    assert.equal(first.messages[0].key, USER_A);

    const payload = JSON.parse(first.messages[0].value);
    assert.equal(payload.type, "UserVerified");
    assert.equal(payload.data.userId, USER_A);
    assert.equal(payload.data.email, "a@u.nus.edu");
    assert.ok(typeof payload.eventId === "string" && payload.eventId.length > 0);
  });

  it("sends only the deleted UUID with stable outbox metadata on the same user-status topic", async () => {
    const fake = recordingProducer();
    const publisher = new KafkaUserEventPublisher(fake.producer);
    // Even if a caller accidentally passes extra profile fields, never emit them.
    const input = { userId: USER_A, email: "private@u.nus.edu", passwordHash: "private" };
    const expected = {
      eventId: "deleted-event-1", type: "UserDeleted", occurredAt: "2026-11-02T00:00:00.000Z",
      data: { userId: USER_A },
    };
    assert.deepEqual(buildUserDeletedEnvelope(input, {
      eventId: expected.eventId, occurredAt: expected.occurredAt,
    }), expected);
    await publisher.publishUserVerified({ userId: USER_A, email: "private@u.nus.edu" });
    await publisher.publishUserDeleted(input, expected.eventId, expected.occurredAt);
    assert.equal(fake.connects(), 1);
    assert.equal(fake.sent[1].topic, "foc.user.status");
    assert.equal(fake.sent[1].messages[0].key, USER_A);
    assert.deepEqual(JSON.parse(fake.sent[1].messages[0].value), expected);
  });
});

describe("LoggingUserEventPublisher", () => {
  it("never throws when Kafka is disabled", async () => {
    await new LoggingUserEventPublisher().publishUserVerified({
      userId: USER_A,
      email: "a@u.nus.edu",
    });
  });
});
