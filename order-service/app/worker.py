"""Relay the outbox, consume credit events, and expire orders that are past due.

The API process does not connect to Kafka. A broker outage cannot fail a request.
"""

import base64
import logging
import time
from collections.abc import Callable
from typing import Protocol

from confluent_kafka import Consumer, KafkaException, Message, Producer, TopicPartition
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import required_env
from app.db import database_url, make_engine, make_session_factory
from app.events import dump_event
from foc_observability import (
    context_from_event_body,
    configure_logging,
    log_context,
    log_event,
)
from app.messaging import (
    CONSUMER_GROUP,
    CREDIT_DLQ_TOPIC,
    CREDIT_TOPIC,
    EXPIRY_SWEEP_SECONDS,
    MAX_ATTEMPTS,
    ORDER_TOPIC,
    RELAY_BATCH_SIZE,
    RELAY_POLL_SECONDS,
    RETRY_BACKOFF_SECONDS,
    WORKER_HEARTBEAT_SECONDS,
)
from app.models import OutboxEvent, ParkedMessage, utc_now
from app.services.orders import expire_overdue_orders, handle_delivery

logger = logging.getLogger(__name__)

PUBLISH_TIMEOUT_SECONDS = 10


class Publisher(Protocol):
    """Something that accepts one outbox row. Tests substitute a fake."""

    def publish(self, event: OutboxEvent) -> None:
        """Publish one event or raise if the broker rejects it."""


class _Delivery:
    """Result of one produce call. A later call cannot observe this one."""

    def __init__(self) -> None:
        self.error = None
        self.done = False

    def __call__(self, err, _message) -> None:
        self.error = err
        self.done = True


class KafkaPublisher:
    def __init__(self, producer: Producer) -> None:
        self._producer = producer

    def publish(self, event: OutboxEvent) -> None:
        delivery = _Delivery()
        self._producer.produce(
            topic=ORDER_TOPIC,
            key=str(event.order_id).encode("utf-8"),
            value=dump_event(event),
            headers=[
                ("event_type", event.event_type.encode("utf-8")),
                ("event_id", str(event.event_id).encode("utf-8")),
            ],
            on_delivery=delivery,
        )
        self._require_delivery(delivery)

    def dead_letter(self, key: bytes | None, value: bytes | None, headers: list | None) -> None:
        """Copy a credit message that could not be applied onto the dead-letter topic."""

        delivery = _Delivery()
        self._producer.produce(
            topic=CREDIT_DLQ_TOPIC,
            key=key,
            value=value,
            headers=headers,
            on_delivery=delivery,
        )
        self._require_delivery(delivery)

    def _require_delivery(self, delivery: _Delivery) -> None:
        self._producer.flush(PUBLISH_TIMEOUT_SECONDS)
        if delivery.error is not None:
            raise KafkaException(delivery.error)
        if not delivery.done:
            raise RuntimeError("Kafka did not acknowledge the record")


def relay_once(db: Session, publisher: Publisher) -> int:
    """Publish unpublished outbox rows in id order. Stop at the first broker failure."""

    statement = (
        select(OutboxEvent)
        .where(OutboxEvent.published_at.is_(None))
        .order_by(OutboxEvent.id)
        .limit(RELAY_BATCH_SIZE)
    )
    if db.get_bind().dialect.name == "postgresql":
        statement = statement.with_for_update(skip_locked=True)
    pending = list(db.scalars(statement))
    published = 0
    for event in pending:
        publisher.publish(event)
        event.published_at = utc_now()
        db.commit()
        published += 1
    return published


def relay_parked_once(db: Session, publisher: KafkaPublisher) -> int:
    """Move parked credit messages onto the DLQ in id order. Stop at the first broker failure."""

    pending = list(
        db.scalars(
            select(ParkedMessage)
            .where(ParkedMessage.published_at.is_(None))
            .order_by(ParkedMessage.id)
            .limit(RELAY_BATCH_SIZE)
        )
    )
    for parked in pending:
        headers = [(name, value and base64.b64decode(value)) for name, value in parked.headers or []]
        publisher.dead_letter(parked.key, parked.value, headers or None)
        parked.published_at = utc_now()
        db.commit()
    return len(pending)


def process_delivery(
    session_factory: Callable[[], Session],
    body: bytes,
    *,
    sleep: Callable[[float], None] = time.sleep,
) -> str:
    """Apply one message. Returns 'ack' or 'nack' after bounded backoff."""

    with log_context(**context_from_event_body(body)):
        started = time.perf_counter()
        outcome = _process_delivery(session_factory, body, sleep=sleep)
        log_event(
            logger,
            logging.INFO,
            "message_processing_completed",
            duration_ms=round((time.perf_counter() - started) * 1000, 3),
            outcome=outcome,
        )
        return outcome


def _process_delivery(
    session_factory: Callable[[], Session],
    body: bytes,
    *,
    sleep: Callable[[float], None],
) -> str:
    for attempt in range(MAX_ATTEMPTS):
        db = session_factory()
        try:
            handle_delivery(db, body)
        except Exception:
            db.rollback()
            if attempt >= MAX_ATTEMPTS - 1:
                log_event(
                    logger,
                    logging.ERROR,
                    "message_retry_exhausted",
                    attempts=attempt + 1,
                    max_attempts=MAX_ATTEMPTS,
                )
                log_event(
                    logger,
                    logging.ERROR,
                    "message_dead_lettered",
                    attempts=attempt + 1,
                    max_attempts=MAX_ATTEMPTS,
                    exc_info=True,
                )
                return "nack"
            log_event(
                logger,
                logging.WARNING,
                "message_processing_failed",
                attempt=attempt + 1,
            )
            sleep(RETRY_BACKOFF_SECONDS[attempt])
        else:
            return "ack"
        finally:
            db.close()
    return "nack"


def _client_config() -> dict:
    return {"bootstrap.servers": required_env("KAFKA_BOOTSTRAP_SERVERS")}


def _handle_message(
    session_factory: Callable[[], Session],
    publisher: KafkaPublisher,
    consumer: Consumer,
    message: Message,
) -> None:
    body = message.value() or b""
    with log_context(
        topic=message.topic(),
        partition=message.partition(),
        offset=message.offset(),
        **context_from_event_body(body),
    ):
        _handle_message_in_context(
            session_factory, publisher, consumer, message, body
        )


def _handle_message_in_context(
    session_factory: Callable[[], Session],
    publisher: KafkaPublisher,
    consumer: Consumer,
    message: Message,
    body: bytes,
) -> None:
    error = message.error()
    if error is not None:
        if error.fatal():
            raise KafkaException(error)
        log_event(
            logger,
            logging.ERROR,
            "kafka_poll_error",
            reason=str(error),
        )
        return
    if process_delivery(session_factory, body) == "nack":
        try:
            publisher.dead_letter(message.key(), message.value(), message.headers())
            log_event(
                logger,
                logging.ERROR,
                "message_sent_to_dlq",
                dlq_topic=CREDIT_DLQ_TOPIC,
                source_topic=message.topic(),
                source_partition=message.partition(),
                source_offset=message.offset(),
            )
        except (KafkaException, RuntimeError):
            log_event(
                logger,
                logging.ERROR,
                "dead_letter_failed",
                exc_info=True,
            )
            if not _park(session_factory, message):
                # Rewind so the message is retried instead of skipped by a later commit.
                consumer.seek(TopicPartition(message.topic(), message.partition(), message.offset()))
                return
            log_event(
                logger,
                logging.ERROR,
                "message_parked_for_dlq",
                dlq_topic=CREDIT_DLQ_TOPIC,
                source_topic=message.topic(),
                source_partition=message.partition(),
                source_offset=message.offset(),
            )
    consumer.commit(message=message, asynchronous=False)


def _park(session_factory: Callable[[], Session], message: Message) -> bool:
    """Keep a message the DLQ refused in Postgres so its partition can move on."""

    db = session_factory()
    try:
        db.add(
            ParkedMessage(
                source_topic=message.topic(),
                source_partition=message.partition(),
                source_offset=message.offset(),
                key=message.key(),
                value=message.value(),
                headers=[
                    [name, value and base64.b64encode(value).decode("ascii")]
                    for name, value in message.headers() or []
                ],
            )
        )
        db.commit()
    except IntegrityError:
        # Parked before a crash that skipped the offset commit.
        db.rollback()
    except SQLAlchemyError:
        db.rollback()
        log_event(logger, logging.ERROR, "park_failed", exc_info=True)
        return False
    finally:
        db.close()
    return True


def _relay(
    session_factory: Callable[[], Session],
    publisher: Publisher,
    relay: Callable[[Session, Publisher], int] = relay_once,
) -> int:
    db = session_factory()
    try:
        published = relay(db, publisher)
        if published:
            log_event(
                logger,
                logging.INFO,
                "worker_relay_completed",
                relay=relay.__name__,
                count=published,
            )
        return published
    except Exception:
        db.rollback()
        log_event(
            logger,
            logging.ERROR,
            "relay_failed",
            relay=relay.__name__,
            exc_info=True,
        )
        return 0
    finally:
        db.close()


def _sweep(session_factory: Callable[[], Session], next_sweep: float) -> float:
    now = time.monotonic()
    if now < next_sweep:
        return next_sweep
    db = session_factory()
    try:
        expire_overdue_orders(db)
    except Exception:
        db.rollback()
        log_event(logger, logging.ERROR, "expiry_sweep_failed", exc_info=True)
    finally:
        db.close()
    return now + EXPIRY_SWEEP_SECONDS


def main() -> None:
    configure_logging("order-worker", component="worker")
    engine = make_engine(database_url())
    session_factory = make_session_factory(engine)
    producer = Producer(
        {
            **_client_config(),
            "enable.idempotence": True,
            "acks": "all",
            "message.timeout.ms": PUBLISH_TIMEOUT_SECONDS * 1000,
        }
    )
    publisher = KafkaPublisher(producer)
    consumer = Consumer(
        {
            **_client_config(),
            "group.id": CONSUMER_GROUP,
            "enable.auto.commit": False,
            "auto.offset.reset": "earliest",
        }
    )
    consumer.subscribe([CREDIT_TOPIC])
    next_sweep = time.monotonic()
    last_heartbeat = next_sweep
    log_event(
        logger,
        logging.INFO,
        "worker_started",
        worker="order-worker",
        topic=CREDIT_TOPIC,
        consumer_group=CONSUMER_GROUP,
    )
    try:
        while True:
            message = consumer.poll(RELAY_POLL_SECONDS)
            if message is not None:
                _handle_message(session_factory, publisher, consumer, message)
            _relay(session_factory, publisher)
            _relay(session_factory, publisher, relay_parked_once)
            next_sweep = _sweep(session_factory, next_sweep)
            now = time.monotonic()
            if now - last_heartbeat >= WORKER_HEARTBEAT_SECONDS:
                log_event(
                    logger,
                    logging.INFO,
                    "worker_heartbeat",
                    worker="order-worker",
                    topic=CREDIT_TOPIC,
                    consumer_group=CONSUMER_GROUP,
                )
                last_heartbeat = now
    finally:
        log_event(
            logger,
            logging.INFO,
            "worker_shutdown",
            worker="order-worker",
            topic=CREDIT_TOPIC,
            consumer_group=CONSUMER_GROUP,
        )
        consumer.close()
        producer.flush(PUBLISH_TIMEOUT_SECONDS)
        engine.dispose()


if __name__ == "__main__":
    main()
