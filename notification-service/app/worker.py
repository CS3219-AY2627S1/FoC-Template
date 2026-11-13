# AI Assistance Disclosure:
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-03
# Scope: Writing implementation code — write a worker that validates configuration, logs startup, idles until SIGTERM/SIGINT, and exits non-zero on invalid configuration.
# Author review: Keith confirmed review of all affected changes.
# Details: notification-service/ai/usage-log.md; ai-20261103-001
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-04
# Scope: Writing implementation code — replace the idle loop with the order.events consumer: store events in one transaction with NOTIFY, then commit the offset synchronously; stop on malformed records and on any exception (ai-20261104-003).
# Author review: Keith confirmed verification, with 551 tests passed on the Pytest suite (ai-20261104-003).
# Details: notification-service/ai/usage-log.md; ai-20261104-003
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-05
# Scope: Writing implementation code — add failure classification, transient retries, and the dead-letter queue, with the offset committed only after the DLQ write is confirmed (ai-20261105-001).
# Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16 and Kafka 4.1.2, 645 passed; code manually read and verified; manual checks in an isolated Compose run (ai-20261105-001).
# Details: notification-service/ai/usage-log.md; ai-20261105-001
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-06
# Scope: Writing implementation code — raise the DLQ producer's message size limit and log the Kafka error code when a DLQ publish fails (ai-20261106-001).
# Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16 and Kafka 4.1.2, 645 passed; code manually read and verified; manual checks in an isolated Compose run (ai-20261106-001).
# Details: notification-service/ai/usage-log.md; ai-20261106-001
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-06
# Scope: Writing implementation code — use the engine with worker timeouts (ai-20261106-002).
# Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16 and Kafka 4.1.2, 645 passed; code manually read and verified; manual checks in an isolated Compose run (ai-20261106-002).
# Details: notification-service/ai/usage-log.md; ai-20261106-002
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-07
# Scope: Debugging assistance — log the record's failure code when the offset commit fails (ai-20261107-001).
# Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16 and Kafka 4.1.2, 645 passed; code manually read and verified; manual checks in an isolated Compose run (ai-20261107-001).
# Details: notification-service/ai/usage-log.md; ai-20261107-001
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-10
# Scope: Writing implementation code — take a per-recipient transaction-scoped advisory lock, in sorted order, between the processed_events flush and the notifications insert, so each recipient's rows commit in id order (ai-20261110-001).
# Author review: Keith confirmed on 2026-11-10: verification and testing with the full pytest suite (.venv/bin/python -m pytest -rs), 940 passed (ai-20261110-001).
# Details: notification-service/ai/usage-log.md; ai-20261110-001

"""Consume ``order.events`` and write notifications.

Each record is stored in one database transaction, and its offset is committed
only after that transaction has committed. A crash in between redelivers the
record, and the ``processed_events`` primary key then identifies it as a
duplicate, so delivery is at-least-once but the stored effect happens once.

A record that fails is either retried or copied to the dead-letter queue, so
later records in its partition can continue. Its offset is committed only after
Kafka confirms the DLQ write. The worker stops without committing only if that
write or the offset commit fails, or on a fatal Kafka error, so the record is
processed again after a restart and may reach the DLQ twice. If the DLQ write
keeps failing, such as for a compressed record too large for the DLQ, the
partition stays blocked until someone moves the offset past the record.

Failure logs give the exception type and stack frames, never its message: driver
errors can quote statement parameters and JSON from the record.
"""

import logging
import signal
import sys
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal, Protocol

from confluent_kafka import Consumer, KafkaError, KafkaException, Message, Producer
from psycopg.errors import UniqueViolation
from sqlalchemy import text
from sqlalchemy.exc import (
    DBAPIError,
    DisconnectionError,
    IntegrityError,
    InterfaceError,
    OperationalError,
    TimeoutError as SQLAlchemyTimeoutError,
)
from sqlalchemy.orm import Session

from app.config import WorkerSettings, configure_logging
from app.db import make_engine, make_session_factory
from app.events import BeforeCutoff, Event, Ignore, Malformed, process_record
from app.models import Notification, ProcessedEvent
from foc_observability import context_from_event_body, log_context, log_event

logger = logging.getLogger(__name__)

ORDER_TOPIC = "order.events"
DLQ_TOPIC = "notification-service.order-events.dlq"
CONSUMER_GROUP = "notification-service-order"
POLL_TIMEOUT_SECONDS = 1.0
NOTIFY_CHANNEL = "notifications"
# PostgreSQL's default name for the primary key in the initial migration.
PROCESSED_EVENTS_PKEY = "processed_events_pkey"
# First key of the two-key pg_advisory_xact_lock taken per recipient, so these
# locks cannot collide with any other advisory-lock use.
RECIPIENT_LOCK_NAMESPACE = 0x4E4F5446  # "NOTF"
PUBLISH_TIMEOUT_SECONDS = 10
# Above the broker's default limit, so that any uncompressed record order.events
# accepts still fits with the diagnostic headers. event-broker/create-topics.sh
# sets the same value as max.message.bytes on the DLQ topic.
DLQ_MAX_MESSAGE_BYTES = 1_100_000
# How quickly a backoff sleep notices a stop request.
STOP_CHECK_SECONDS = 0.1
WORKER_HEARTBEAT_SECONDS = 60.0
WORKER_NAME = "notification-worker"

FailureCode = Literal[
    "MALFORMED_MESSAGE",
    "TRANSIENT_RETRIES_EXHAUSTED",
    "UNEXPECTED_PROCESSING_ERROR",
]


class WorkerAbort(Exception):
    """The worker must stop. The cause has already been logged."""


class CommittingConsumer(Protocol):
    def poll(self, timeout: float) -> Message | None: ...

    def commit(self, *, message: Message, asynchronous: bool) -> object: ...

    def close(self) -> None: ...


class DeadLetterPublisher(Protocol):
    def dead_letter(
        self, message: Message, *, failure_code: FailureCode, attempts: int
    ) -> None: ...


@dataclass(frozen=True)
class DeliveryResult:
    """How one record ended. ``failure_code`` is set if it needs the DLQ."""

    result: BeforeCutoff | Ignore | Event | None
    attempts: int
    failure_code: FailureCode | None = None
    outcome: str = "unknown"


class _Delivery:
    """Delivery callback state for one Kafka produce call."""

    def __init__(self) -> None:
        self.error = None
        self.done = False

    def __call__(self, error, _message) -> None:
        self.error = error
        self.done = True


class KafkaPublisher:
    """Copy failed records to the DLQ and wait for the broker's confirmation."""

    def __init__(self, producer: Producer) -> None:
        self._producer = producer

    def dead_letter(
        self, message: Message, *, failure_code: FailureCode, attempts: int
    ) -> None:
        failed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        headers = list(message.headers() or [])
        headers.extend(
            [
                ("x-notification-failure-code", failure_code.encode()),
                ("x-notification-failed-at", failed_at.encode()),
                ("x-notification-failed-attempts", str(attempts).encode()),
                ("x-notification-source-topic", message.topic().encode()),
                ("x-notification-source-partition", str(message.partition()).encode()),
                ("x-notification-source-offset", str(message.offset()).encode()),
            ]
        )
        delivery = _Delivery()
        self._producer.produce(
            topic=DLQ_TOPIC,
            key=message.key(),
            value=message.value(),
            headers=headers,
            on_delivery=delivery,
        )
        remaining = self._producer.flush(PUBLISH_TIMEOUT_SECONDS)
        if delivery.error is not None:
            raise KafkaException(delivery.error)
        if remaining or not delivery.done:
            raise RuntimeError("Kafka did not acknowledge the DLQ record")


def _is_duplicate_event(error: IntegrityError) -> bool:
    return (
        isinstance(error.orig, UniqueViolation)
        and error.orig.diag.constraint_name == PROCESSED_EVENTS_PKEY
    )


def store_event(
    session_factory: Callable[[], Session], result: BeforeCutoff | Event
) -> bool:
    """Write one event in one transaction. Return False if already processed."""

    drafts = result.drafts if isinstance(result, Event) else []
    try:
        with session_factory() as db, db.begin():
            # Flushed alone so that a duplicate fails before anything else runs.
            # A concurrent delivery blocks here until the other transaction ends.
            db.add(
                ProcessedEvent(
                    event_id=result.event_id,
                    event_type=result.event_type,
                    processed_at=datetime.now(timezone.utc),
                )
            )
            db.flush()
            # Keep each recipient's rows committing in id order, which the SSE
            # stream relies on: ids are assigned on insert, so only one
            # transaction at a time may hold uncommitted rows for a recipient,
            # and it locks before inserting. A fixed order prevents deadlocks
            # between events that share recipients. PostgreSQL releases the
            # locks on commit or rollback.
            recipient_ids = sorted({str(draft.recipient_id) for draft in drafts})
            for recipient_id in recipient_ids:
                db.execute(
                    text(
                        "SELECT pg_advisory_xact_lock("
                        ":namespace, hashtext(:recipient_id))"
                    ),
                    {
                        "namespace": RECIPIENT_LOCK_NAMESPACE,
                        "recipient_id": recipient_id,
                    },
                )
            db.add_all(
                Notification(
                    recipient_id=draft.recipient_id,
                    recipient_role=draft.recipient_role,
                    event_id=result.event_id,
                    order_id=result.order_id,
                    type=draft.type,
                    params=draft.params,
                    title=draft.title,
                    body=draft.body,
                    occurred_at=result.occurred_at,
                )
                for draft in drafts
            )
            db.flush()
            for recipient_id in dict.fromkeys(draft.recipient_id for draft in drafts):
                # NOTIFY takes no bind parameters. recipient_id is a parsed UUID,
                # so its text form cannot break out of the literal.
                db.execute(text(f"NOTIFY {NOTIFY_CHANNEL}, '{recipient_id}'"))
    except IntegrityError as error:
        if _is_duplicate_event(error):
            return False
        raise
    return True


def _log_outcome(
    outcome: str,
    result: BeforeCutoff | Ignore | Event,
    message: Message,
    *,
    notifications: int = 0,
    attempts: int = 1,
    duration_ms: float | None = None,
) -> None:
    fields = {
        "event_id": result.event_id,
        "event_type": result.event_type,
        "order_id": result.order_id,
        "notifications": notifications,
        "attempts": attempts,
        "topic": message.topic(),
        "partition": message.partition(),
        "offset": message.offset(),
    }
    if duration_ms is not None:
        fields["duration_ms"] = duration_ms
    correlation_id = getattr(result, "correlation_id", None)
    if correlation_id is not None:
        fields["correlation_id"] = correlation_id
    log_event(
        logger,
        logging.INFO,
        f"notification_event_{outcome}",
        **fields,
    )


def _is_transient(error: Exception) -> bool:
    if isinstance(
        error,
        (
            OperationalError,
            InterfaceError,
            DisconnectionError,
            SQLAlchemyTimeoutError,
        ),
    ):
        return True
    return isinstance(error, DBAPIError) and error.connection_invalidated


def _kafka_error_name(error: Exception) -> str | None:
    """The Kafka error code, such as MSG_SIZE_TOO_LARGE, if ``error`` has one."""

    if isinstance(error, KafkaException) and error.args:
        if isinstance(error.args[0], KafkaError):
            return error.args[0].name()
    return None


def _message_error_name(error: object) -> str | None:
    """Return a Kafka poll error code without logging its free-form text."""

    name = getattr(error, "name", None)
    return name() if callable(name) else None


def _failure_fields(
    error: Exception, result: BeforeCutoff | Ignore | Event | None, message: Message
) -> dict[str, object]:
    fields: dict[str, object] = {
        "exception_type": type(error).__name__,
        "sqlstate": getattr(getattr(error, "orig", None), "sqlstate", None),
        "event_id": getattr(result, "event_id", None),
        "event_type": getattr(result, "event_type", None),
        "order_id": getattr(result, "order_id", None),
        "correlation_id": getattr(result, "correlation_id", None),
        "topic": message.topic(),
        "partition": message.partition(),
        "offset": message.offset(),
    }
    return {key: value for key, value in fields.items() if value is not None}


def _log_failure(
    failure_code: FailureCode | None,
    attempts: int,
    error: Exception,
    result: BeforeCutoff | Ignore | Event | None,
    message: Message,
    *,
    event: str = "notification_event_failed",
    kafka_error: str | None = None,
    duration_ms: float | None = None,
) -> None:
    fields = {
        "failure_code": failure_code,
        "attempts": attempts,
        **_failure_fields(error, result, message),
    }
    if kafka_error is not None:
        fields["kafka_error"] = kafka_error
    if duration_ms is not None:
        fields["duration_ms"] = duration_ms
    if failure_code == "TRANSIENT_RETRIES_EXHAUSTED":
        log_event(
            logger,
            logging.ERROR,
            "message_retry_exhausted",
            **fields,
        )
    log_event(
        logger,
        logging.ERROR,
        event,
        **fields,
    )


def process_delivery(
    session_factory: Callable[[], Session],
    message: Message,
    *,
    start_at: datetime,
    retry_backoff_seconds: tuple[float, ...],
    stop: threading.Event,
    sleep: Callable[[float], None],
) -> DeliveryResult:
    """Apply one record, retrying transient errors. Record failures never raise.

    If ``stop`` is set during a backoff sleep, return without a failure code. The
    caller sees ``stop`` and leaves the offset uncommitted.
    """

    started = time.perf_counter()

    try:
        result = process_record(
            message.key(), message.value(), message.headers(), start_at=start_at
        )
    except Exception as error:
        _log_failure(
            "UNEXPECTED_PROCESSING_ERROR",
            1,
            error,
            None,
            message,
            duration_ms=round((time.perf_counter() - started) * 1000, 3),
        )
        return DeliveryResult(
            None, 1, "UNEXPECTED_PROCESSING_ERROR", outcome="failed"
        )

    if isinstance(result, Malformed):
        log_event(
            logger,
            logging.ERROR,
            "notification_event_failed",
            failure_code="MALFORMED_MESSAGE",
            attempts=1,
            reason=result.reason,
            topic=message.topic(),
            partition=message.partition(),
            offset=message.offset(),
            duration_ms=round((time.perf_counter() - started) * 1000, 3),
        )
        return DeliveryResult(None, 1, "MALFORMED_MESSAGE", outcome="malformed")

    if isinstance(result, Ignore):
        _log_outcome(
            "ignored",
            result,
            message,
            duration_ms=round((time.perf_counter() - started) * 1000, 3),
        )
        return DeliveryResult(result, 1, outcome="ignored")

    for attempts, delay in enumerate((*retry_backoff_seconds, None), start=1):
        try:
            stored = store_event(session_factory, result)
        except Exception as error:
            if not _is_transient(error):
                failure_code: FailureCode = "UNEXPECTED_PROCESSING_ERROR"
            elif delay is None:
                failure_code = "TRANSIENT_RETRIES_EXHAUSTED"
            else:
                log_event(
                    logger,
                    logging.WARNING,
                    "notification_event_retrying",
                    attempt=attempts,
                    retry_delay_seconds=delay,
                    **_failure_fields(error, result, message),
                )
                sleep(delay)
                if stop.is_set():
                    return DeliveryResult(result, attempts, outcome="stopping")
                continue
            _log_failure(
                failure_code,
                attempts,
                error,
                result,
                message,
                duration_ms=round((time.perf_counter() - started) * 1000, 3),
            )
            return DeliveryResult(
                result, attempts, failure_code, outcome="failed"
            )

        duration_ms = round((time.perf_counter() - started) * 1000, 3)
        if not stored:
            _log_outcome(
                "duplicate", result, message, attempts=attempts, duration_ms=duration_ms
            )
            outcome = "duplicate"
        elif isinstance(result, BeforeCutoff):
            _log_outcome(
                "before_cutoff",
                result,
                message,
                attempts=attempts,
                duration_ms=duration_ms,
            )
            outcome = "before_cutoff"
        else:
            _log_outcome(
                "stored",
                result,
                message,
                notifications=len(result.drafts),
                attempts=attempts,
                duration_ms=duration_ms,
            )
            outcome = "stored"
        return DeliveryResult(result, attempts, outcome=outcome)
    raise AssertionError("Retry loop exited without a delivery result")


def handle_message(
    session_factory: Callable[[], Session],
    consumer: CommittingConsumer,
    publisher: DeadLetterPublisher,
    message: Message,
    *,
    start_at: datetime,
    retry_backoff_seconds: tuple[float, ...],
    stop: threading.Event,
    sleep: Callable[[float], None],
) -> None:
    """Process one record with its Kafka and domain context attached to logs."""

    with log_context(
        topic=message.topic(),
        partition=message.partition(),
        offset=message.offset(),
        **context_from_event_body(message.value()),
    ):
        _handle_message_in_context(
            session_factory,
            consumer,
            publisher,
            message,
            start_at=start_at,
            retry_backoff_seconds=retry_backoff_seconds,
            stop=stop,
            sleep=sleep,
        )


def _handle_message_in_context(
    session_factory: Callable[[], Session],
    consumer: CommittingConsumer,
    publisher: DeadLetterPublisher,
    message: Message,
    *,
    start_at: datetime,
    retry_backoff_seconds: tuple[float, ...],
    stop: threading.Event,
    sleep: Callable[[float], None],
) -> None:
    """Process one polled message, then synchronously commit its offset."""

    error = message.error()
    if error is not None:
        if error.fatal():
            log_event(
                logger,
                logging.ERROR,
                "kafka_fatal_error",
                error_type=type(error).__name__,
                kafka_error=_message_error_name(error),
            )
            raise WorkerAbort
        log_event(
            logger,
            logging.ERROR,
            "kafka_poll_error",
            error_type=type(error).__name__,
            kafka_error=_message_error_name(error),
        )
        return

    # A record polled while stopping is left for the next run.
    if stop.is_set():
        return

    started = time.perf_counter()
    outcome = process_delivery(
        session_factory,
        message,
        start_at=start_at,
        retry_backoff_seconds=retry_backoff_seconds,
        stop=stop,
        sleep=sleep,
    )
    log_event(
        logger,
        logging.ERROR if outcome.failure_code is not None else logging.INFO,
        "message_processing_completed",
        duration_ms=round((time.perf_counter() - started) * 1000, 3),
        outcome=outcome.outcome,
        attempts=outcome.attempts,
        failure_code=outcome.failure_code,
        notifications=(
            len(outcome.result.drafts) if isinstance(outcome.result, Event) else 0
        ),
    )

    if stop.is_set():
        # The next run sees a duplicate, or reprocesses the record.
        log_event(
            logger,
            logging.INFO,
            "notification_offset_not_committed",
            event_id=getattr(outcome.result, "event_id", None),
            topic=message.topic(),
            partition=message.partition(),
            offset=message.offset(),
        )
        return

    if outcome.failure_code is not None:
        try:
            publisher.dead_letter(
                message, failure_code=outcome.failure_code, attempts=outcome.attempts
            )
        except Exception as failure:
            _log_failure(
                outcome.failure_code,
                outcome.attempts,
                failure,
                outcome.result,
                message,
                event="message_dlq_publish_failed",
                kafka_error=_kafka_error_name(failure),
            )
            raise WorkerAbort from None
        log_event(
            logger,
            logging.ERROR,
            "message_sent_to_dlq",
            failure_code=outcome.failure_code,
            attempts=outcome.attempts,
            event_id=getattr(outcome.result, "event_id", None),
            dlq_topic=DLQ_TOPIC,
            source_topic=message.topic(),
            source_partition=message.partition(),
            source_offset=message.offset(),
        )

    try:
        consumer.commit(message=message, asynchronous=False)
    except Exception as failure:
        _log_failure(
            outcome.failure_code,
            outcome.attempts,
            failure,
            outcome.result,
            message,
            event="notification_offset_commit_failed",
        )
        raise WorkerAbort from None


def sleep_until_stopped(delay: float, stop: threading.Event) -> None:
    """Sleep for ``delay`` seconds, returning early once ``stop`` is set.

    Not ``stop.wait(delay)``: the signal handler calls ``stop.set()`` on this same
    thread, and that deadlocks if the signal lands while ``wait`` holds the
    Event's non-reentrant lock.
    """

    deadline = time.monotonic() + delay
    while not stop.is_set():
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return
        time.sleep(min(remaining, STOP_CHECK_SECONDS))


def make_consumer(settings: WorkerSettings) -> Consumer:
    consumer = Consumer(
        {
            "bootstrap.servers": settings.kafka_bootstrap_servers,
            "group.id": CONSUMER_GROUP,
            "enable.auto.commit": False,
            "enable.auto.offset.store": False,
            "auto.offset.reset": "earliest",
        }
    )
    consumer.subscribe([ORDER_TOPIC])
    return consumer


def make_producer(settings: WorkerSettings) -> Producer:
    return Producer(
        {
            "bootstrap.servers": settings.kafka_bootstrap_servers,
            "enable.idempotence": True,
            "acks": "all",
            "message.timeout.ms": PUBLISH_TIMEOUT_SECONDS * 1000,
            "message.max.bytes": DLQ_MAX_MESSAGE_BYTES,
        }
    )


def run(
    settings: WorkerSettings,
    stop: threading.Event,
    consumer: CommittingConsumer | None = None,
    publisher: DeadLetterPublisher | None = None,
    sleep: Callable[[float], None] | None = None,
) -> None:
    """Consume until ``stop`` is set. Raise WorkerAbort if the worker must stop."""

    engine = make_engine(settings.database_url, worker_timeouts=True)
    session_factory = make_session_factory(engine)
    consumer = consumer or make_consumer(settings)
    publisher = publisher or KafkaPublisher(make_producer(settings))
    sleep = sleep or (lambda delay: sleep_until_stopped(delay, stop))
    log_event(
        logger,
        logging.INFO,
        "worker_started",
        worker=WORKER_NAME,
        topic=ORDER_TOPIC,
        consumer_group=CONSUMER_GROUP,
    )
    last_heartbeat = time.monotonic()
    try:
        while not stop.is_set():
            try:
                message = consumer.poll(POLL_TIMEOUT_SECONDS)
            except KafkaException as error:
                log_event(
                    logger,
                    logging.ERROR,
                    "kafka_fatal_error",
                    error_type=type(error).__name__,
                    kafka_error=_kafka_error_name(error),
                )
                raise WorkerAbort from None
            if message is not None:
                handle_message(
                    session_factory,
                    consumer,
                    publisher,
                    message,
                    start_at=settings.notifications_start_at,
                    retry_backoff_seconds=settings.retry_backoff_seconds,
                    stop=stop,
                    sleep=sleep,
                )
            now = time.monotonic()
            if now - last_heartbeat >= WORKER_HEARTBEAT_SECONDS:
                log_event(
                    logger,
                    logging.INFO,
                    "worker_heartbeat",
                    worker=WORKER_NAME,
                    topic=ORDER_TOPIC,
                    consumer_group=CONSUMER_GROUP,
                )
                last_heartbeat = now
    finally:
        log_event(
            logger,
            logging.INFO,
            "worker_shutdown",
            worker=WORKER_NAME,
            topic=ORDER_TOPIC,
            consumer_group=CONSUMER_GROUP,
        )
        consumer.close()
        engine.dispose()


def main() -> None:
    settings = WorkerSettings.from_env()
    configure_logging(settings.log_level, component="worker")
    stop = threading.Event()

    def request_stop(signum: int, _frame) -> None:
        log_event(
            logger,
            logging.INFO,
            "worker_shutdown_requested",
            worker=WORKER_NAME,
            signal=signum,
        )
        stop.set()

    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)
    try:
        run(settings, stop)
    except WorkerAbort:
        log_event(
            logger,
            logging.ERROR,
            "worker_aborted",
            worker=WORKER_NAME,
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
