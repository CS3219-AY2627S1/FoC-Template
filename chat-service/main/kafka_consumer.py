# AI Assistance Disclosure:
# Tool: OpenAI Codex (GPT-5), dates: 2026-11-08 to 2026-11-10
# Scope: Implementation and test assistance for Chat Service lifecycle events.

import asyncio
import json
import logging
import os

from aiokafka import AIOKafkaConsumer

from main.database import SessionLocal
from main.lifecycle import apply_lifecycle_event


logger = logging.getLogger(__name__)

TOPICS = (
    "errand.created",
    "errand.accepted",
    "errand.delivered",
    "errand.completed",
    "errand.failed",
    "errand.cancelled",
    "errand.expired",
)


def decode_header(value: bytes | None) -> str | None:
    if value is None:
        return None
    return value.decode("utf-8").strip('"')


def decode_payload(value: bytes) -> dict:
    payload = json.loads(value.decode("utf-8"))
    if isinstance(payload, str):
        payload = json.loads(payload)
    if not isinstance(payload, dict):
        raise ValueError("Kafka lifecycle payload must be a JSON object")
    return payload


async def consume_lifecycle_events(stop: asyncio.Event) -> None:
    while not stop.is_set():
        consumer = AIOKafkaConsumer(
            *TOPICS,
            bootstrap_servers=os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092"),
            group_id=os.getenv("KAFKA_CHAT_GROUP_ID", "chat-service-lifecycle-v1"),
            enable_auto_commit=False,
            auto_offset_reset="earliest",
        )
        started = False
        try:
            await consumer.start()
            started = True
            logger.info("Chat lifecycle consumer started")
            while not stop.is_set():
                batch = await consumer.getmany(timeout_ms=1000, max_records=100)
                handled_any = False
                for records in batch.values():
                    for record in records:
                        handled_any = True
                        headers = dict(record.headers)
                        event_type = decode_header(headers.get("eventType")) or record.topic
                        event_id = decode_header(headers.get("eventId"))
                        if not event_id:
                            raise ValueError(f"Lifecycle event on {record.topic} has no eventId header")
                        payload = decode_payload(record.value)
                        with SessionLocal.begin() as db:
                            apply_lifecycle_event(db, event_id, event_type, payload)
                if handled_any:
                    await consumer.commit()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Chat lifecycle consumer failed; retrying in five seconds")
            try:
                await asyncio.wait_for(stop.wait(), timeout=5)
            except TimeoutError:
                pass
        finally:
            try:
                await consumer.stop()
            finally:
                if started:
                    logger.info("Chat lifecycle consumer stopped")

