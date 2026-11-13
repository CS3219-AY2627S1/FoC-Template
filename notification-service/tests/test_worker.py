# AI Assistance Disclosure:
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-03
# Scope: Writing implementation code — write a test that the worker idles until its stop event is set.
# Author review: Keith confirmed review of all affected changes.
# Details: notification-service/ai/usage-log.md; ai-20261103-001
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-04
# Scope: Writing implementation code; Debugging assistance — replace the idle test with consumer tests that need no database: configuration, poll errors, malformed records, ignored records, and SIGTERM; strengthen the stop test after a mutation survived (ai-20261104-003).
# Author review: Keith confirmed verification, with 551 tests passed on the Pytest suite (ai-20261104-003).
# Details: notification-service/ai/usage-log.md; ai-20261104-003
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-05
# Scope: Writing implementation code — update the consumer tests for the DLQ, and add tests for failure classification, retry counts and delays, DLQ headers, commit ordering, and stopping during backoff (ai-20261105-001).
# Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16 and Kafka 4.1.2, 645 passed; code manually read and verified; manual checks in an isolated Compose run (ai-20261105-001).
# Details: notification-service/ai/usage-log.md; ai-20261105-001
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-06
# Scope: Writing implementation code — test the DLQ size limit and the Kafka error code in failure logs (ai-20261106-001).
# Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16 and Kafka 4.1.2, 645 passed; code manually read and verified; manual checks in an isolated Compose run (ai-20261106-001).
# Details: notification-service/ai/usage-log.md; ai-20261106-001
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-06
# Scope: Writing implementation code — test that the worker asks for its timeouts, and that the retry budget stays under max.poll.interval.ms (ai-20261106-002).
# Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16 and Kafka 4.1.2, 645 passed; code manually read and verified; manual checks in an isolated Compose run (ai-20261106-002).
# Details: notification-service/ai/usage-log.md; ai-20261106-002
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-07
# Scope: Writing implementation code — test the failure code logged when the offset commit fails (ai-20261107-001).
# Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16 and Kafka 4.1.2, 645 passed; code manually read and verified; manual checks in an isolated Compose run (ai-20261107-001).
# Details: notification-service/ai/usage-log.md; ai-20261107-001
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-08
# Scope: Writing implementation code — supply the User Service settings the API now requires (ai-20261108-001).
# Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16, 790 passed and 5 real-broker tests skipped; code read and verified; manual checks against the full Compose stack with the real User Service (ai-20261108-001).
# Details: notification-service/ai/usage-log.md; ai-20261108-001

"""Worker tests that need neither Kafka nor a database."""

import json
import logging
import os
import selectors
import signal
import subprocess
import sys
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import certifi
import pytest
from confluent_kafka import KafkaError, KafkaException
from fastapi.testclient import TestClient
from sqlalchemy.exc import (
    DataError,
    DBAPIError,
    DisconnectionError,
    IntegrityError,
    InterfaceError,
    OperationalError,
    TimeoutError as SQLAlchemyTimeoutError,
)

from app import db, worker
from app.config import DEFAULT_RETRY_BACKOFF_SECONDS
from app.main import create_app
from app.worker import (
    KafkaPublisher,
    WorkerAbort,
    handle_message,
    make_consumer,
    make_producer,
    run,
    sleep_until_stopped,
)
from tests.worker_support import (
    BOB,
    FakeConsumer,
    FakeError,
    FakeMessage,
    FakeProducer,
    FakePublisher,
    START_AT,
    make_settings,
    order_record,
)

SERVICE_ROOT = Path(__file__).resolve().parents[1]
# Parsed lazily, and nothing here should reach it.
UNREACHABLE_DB = "postgresql+psycopg://nobody@127.0.0.1:1/none"


def no_database():
    raise AssertionError("the database must not be used")


def no_sleep(delay):
    raise AssertionError("nothing here should back off")


def log_fields(caplog, event: str) -> list[dict]:
    return [
        record.fields
        for record in caplog.records
        if getattr(record, "event", None) == event
    ]


def handle(
    consumer,
    message,
    stop=None,
    *,
    publisher=None,
    delays=(),
    sleep=no_sleep,
) -> None:
    handle_message(
        no_database,
        consumer,
        publisher if publisher is not None else FakePublisher(),
        message,
        start_at=START_AT,
        retry_backoff_seconds=delays,
        stop=stop or threading.Event(),
        sleep=sleep,
    )


def run_fake(stop, consumer, publisher=None) -> None:
    run(make_settings(UNREACHABLE_DB), stop, consumer, publisher or FakePublisher())


def test_consumer_configuration(monkeypatch) -> None:
    created = {}

    class Recorder:
        def __init__(self, config) -> None:
            created["config"] = config

        def subscribe(self, topics) -> None:
            created["topics"] = topics

    monkeypatch.setattr(worker, "Consumer", Recorder)

    make_consumer(make_settings(UNREACHABLE_DB))

    assert created["topics"] == ["order.events"]
    assert created["config"] == {
        "bootstrap.servers": "unused:9092",
        "group.id": "notification-service-order",
        "enable.auto.commit": False,
        "enable.auto.offset.store": False,
        "auto.offset.reset": "earliest",
    }


def test_non_fatal_poll_error_is_logged_and_the_loop_continues(caplog) -> None:
    stop = threading.Event()
    bad = FakeMessage(None, None, None, error=FakeError(fatal=False))
    ignored = order_record("order.created", offset=7)
    consumer = FakeConsumer([bad, ignored], stop)

    with caplog.at_level(logging.ERROR):
        run_fake(stop, consumer)

    assert consumer.committed == [7]
    assert consumer.closed
    assert log_fields(caplog, "kafka_poll_error")[-1]["error_type"] == "FakeError"


def test_fatal_poll_error_stops_the_worker(caplog) -> None:
    stop = threading.Event()
    fatal = FakeMessage(None, None, None, error=FakeError(fatal=True))
    never_reached = order_record("order.created", offset=7)
    consumer = FakeConsumer([fatal, never_reached], stop)

    with caplog.at_level(logging.ERROR), pytest.raises(WorkerAbort):
        run_fake(stop, consumer)

    assert consumer.committed == []
    assert consumer.closed
    assert "kafka_fatal_error" in caplog.text


def test_exception_from_poll_stops_the_worker() -> None:
    stop = threading.Event()
    consumer = FakeConsumer([], stop)

    def failing_poll(timeout):
        raise KafkaException("poll failed")

    consumer.poll = failing_poll

    with pytest.raises(WorkerAbort):
        run_fake(stop, consumer)
    assert consumer.closed


def test_ignore_commits_and_logs_identifiers(caplog) -> None:
    consumer = FakeConsumer([], threading.Event())
    order_id, event_id = str(uuid4()), str(uuid4())
    message = order_record("order.created", order_id=order_id, event_id=event_id, offset=3)

    with caplog.at_level(logging.INFO):
        handle(consumer, message)

    assert consumer.committed == [3]
    assert consumer.commit_modes == [False]
    fields = log_fields(caplog, "notification_event_ignored")[-1]
    assert fields["event_id"] == event_id
    assert fields["event_type"] == "order.created"
    assert fields["order_id"] == order_id
    assert fields["topic"] == "order.events"
    assert fields["partition"] == 0
    assert fields["offset"] == 3


def test_malformed_goes_to_the_dlq_and_later_records_keep_flowing(caplog) -> None:
    stop = threading.Event()
    secret = b'{"event_type": "SECRET-CONTENTS"}'
    message = FakeMessage(b"SECRET-KEY", secret, [("h", b"SECRET-HEADER")], offset=9)
    later = order_record("order.created", offset=10)
    consumer = FakeConsumer([message, later], stop)
    publisher = FakePublisher()

    with caplog.at_level(logging.DEBUG):
        run_fake(stop, consumer, publisher)

    assert publisher.published == [(9, "MALFORMED_MESSAGE", 1)]
    assert consumer.committed == [9, 10]
    assert consumer.commit_modes == [False, False]
    fields = log_fields(caplog, "notification_event_failed")[-1]
    assert fields["failure_code"] == "MALFORMED_MESSAGE"
    assert fields["attempts"] == 1
    assert fields["reason"] == "envelope.event_id: missing"
    assert fields["topic"] == "order.events"
    assert fields["partition"] == 0
    assert fields["offset"] == 9
    assert "SECRET" not in caplog.text


def test_control_characters_in_event_type_cannot_forge_log_lines(caplog) -> None:
    consumer = FakeConsumer([], threading.Event())
    message = order_record("order.x\nFORGED", offset=1)

    with caplog.at_level(logging.INFO):
        handle(consumer, message)

    assert consumer.committed == [1]
    assert "\nFORGED" not in caplog.text


def test_record_polled_while_stopping_is_left_uncommitted() -> None:
    stop = threading.Event()
    stop.set()
    consumer = FakeConsumer([], stop)

    # A handled type: no_database fails the test if the record is processed.
    handle(consumer, order_record("order.expired"), stop)

    assert consumer.commit_modes == []


def test_stop_set_during_processing_leaves_the_offset_uncommitted(monkeypatch) -> None:
    stop = threading.Event()
    consumer = FakeConsumer([], stop)
    real_log = worker._log_outcome

    def stop_while_processing(*args, **kwargs):
        stop.set()
        real_log(*args, **kwargs)

    monkeypatch.setattr(worker, "_log_outcome", stop_while_processing)

    handle(consumer, order_record("order.created"), stop)

    assert consumer.commit_modes == []


def test_sigterm_closes_the_consumer_and_exits_cleanly() -> None:
    """Run the real process against an unreachable broker."""

    environment = {
        **os.environ,
        "DATABASE_URL": UNREACHABLE_DB,
        "KAFKA_BOOTSTRAP_SERVERS": "127.0.0.1:1",
        "NOTIFICATIONS_START_AT": "2026-11-04T00:00:00+00:00",
        "NOTIFICATION_RETRY_BACKOFF_SECONDS": "0.5,1",
        "LOG_LEVEL": "INFO",
        "PYTHONUNBUFFERED": "1",
    }
    process = subprocess.Popen(
        [sys.executable, "-m", "app.worker"],
        cwd=SERVICE_ROOT,
        env=environment,
        stdout=subprocess.PIPE,
        text=True,
    )
    try:
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ)
            deadline = time.monotonic() + 30
            started = ""
            while '"event": "worker_started"' not in started:
                assert time.monotonic() < deadline and selector.select(timeout=30)
                started = process.stdout.readline()
        process.send_signal(signal.SIGTERM)
        stdout, _ = process.communicate(timeout=30)
    finally:
        process.kill()
        process.wait()

    assert process.returncode == 0
    assert '"event": "worker_shutdown"' in stdout


# --- Failure classification and retries ---


def driver_error(cls, *, invalidated: bool = False):
    return cls(
        "SELECT 1",
        {"reason": "SECRET-PARAM"},
        Exception("SECRET-MESSAGE"),
        connection_invalidated=invalidated,
    )


TRANSIENT_ERRORS = [
    pytest.param(lambda: driver_error(OperationalError), id="operational"),
    pytest.param(lambda: driver_error(InterfaceError), id="interface"),
    pytest.param(lambda: DisconnectionError("SECRET-MESSAGE"), id="disconnection"),
    pytest.param(lambda: SQLAlchemyTimeoutError("SECRET-MESSAGE"), id="pool-timeout"),
    pytest.param(lambda: driver_error(DBAPIError, invalidated=True), id="invalidated"),
    pytest.param(lambda: driver_error(DataError, invalidated=True), id="invalidated-data"),
]
UNEXPECTED_ERRORS = [
    pytest.param(lambda: driver_error(DataError), id="data"),
    pytest.param(lambda: driver_error(DBAPIError), id="dbapi-still-connected"),
    pytest.param(lambda: driver_error(IntegrityError), id="integrity"),
    pytest.param(lambda: RuntimeError("SECRET-MESSAGE"), id="runtime"),
]


class Scripted:
    """Stands in for store_event: raises or returns each scripted step in turn."""

    def __init__(self, *steps) -> None:
        self._steps = list(steps)
        self.calls = 0

    def __call__(self, _session_factory, _result) -> bool:
        self.calls += 1
        step = self._steps.pop(0)
        if isinstance(step, Exception):
            raise step
        return step


def scripted_store(monkeypatch, *steps) -> Scripted:
    store = Scripted(*steps)
    monkeypatch.setattr(worker, "store_event", store)
    return store


@pytest.mark.parametrize("make_error", TRANSIENT_ERRORS)
def test_transient_error_retries_at_each_delay_then_goes_to_the_dlq(
    monkeypatch, make_error
) -> None:
    delays = (0.5, 1.0, 2.0)
    store = scripted_store(monkeypatch, *[make_error() for _ in range(4)])
    consumer = FakeConsumer([], threading.Event())
    publisher = FakePublisher()
    slept = []

    handle(
        consumer,
        order_record("order.expired", offset=6),
        publisher=publisher,
        delays=delays,
        sleep=slept.append,
    )

    assert store.calls == len(delays) + 1
    assert slept == list(delays)
    assert publisher.published == [(6, "TRANSIENT_RETRIES_EXHAUSTED", 4)]
    assert consumer.committed == [6]


def test_retries_are_logged_with_attempt_and_delay(monkeypatch, caplog) -> None:
    error = driver_error(OperationalError)
    scripted_store(monkeypatch, error, error, error)
    with caplog.at_level(logging.INFO):
        handle(
            FakeConsumer([], threading.Event()),
            order_record("order.expired"),
            delays=(0.5, 1.0),
            sleep=lambda _delay: None,
        )

    retries = log_fields(caplog, "notification_event_retrying")
    assert [fields["attempt"] for fields in retries] == [1, 2]
    assert [fields["retry_delay_seconds"] for fields in retries] == [0.5, 1.0]
    assert log_fields(caplog, "notification_event_failed")[-1]["failure_code"] == (
        "TRANSIENT_RETRIES_EXHAUSTED"
    )
    assert log_fields(caplog, "message_sent_to_dlq")[-1]["failure_code"] == (
        "TRANSIENT_RETRIES_EXHAUSTED"
    )


@pytest.mark.parametrize("make_error", UNEXPECTED_ERRORS)
def test_other_errors_go_to_the_dlq_without_a_retry(monkeypatch, make_error) -> None:
    store = scripted_store(monkeypatch, make_error())
    consumer = FakeConsumer([], threading.Event())
    publisher = FakePublisher()

    handle(
        consumer,
        order_record("order.expired", offset=2),
        publisher=publisher,
        delays=(0.5, 1.0),
    )

    assert store.calls == 1
    assert publisher.published == [(2, "UNEXPECTED_PROCESSING_ERROR", 1)]
    assert consumer.committed == [2]


def test_recovery_within_the_retry_window_sends_nothing_to_the_dlq(monkeypatch) -> None:
    error = driver_error(OperationalError)
    store = scripted_store(monkeypatch, error, error, True)
    consumer = FakeConsumer([], threading.Event())
    publisher = FakePublisher()
    slept = []

    handle(
        consumer,
        order_record("order.expired", offset=4),
        publisher=publisher,
        delays=(0.5, 1.0, 2.0),
        sleep=slept.append,
    )

    assert store.calls == 3
    assert slept == [0.5, 1.0]
    assert publisher.published == []
    assert consumer.committed == [4]


def test_transient_then_duplicate_is_already_processed(monkeypatch, caplog) -> None:
    """A commit whose outcome was lost and which had in fact succeeded."""

    scripted_store(monkeypatch, driver_error(OperationalError), False)
    consumer = FakeConsumer([], threading.Event())
    publisher = FakePublisher()

    with caplog.at_level(logging.INFO):
        handle(
            consumer,
            order_record("order.expired", offset=4),
            publisher=publisher,
            delays=(0.5,),
            sleep=lambda _delay: None,
        )

    assert publisher.published == []
    assert consumer.committed == [4]
    assert "notification_event_duplicate" in caplog.text


def test_transient_then_non_transient_is_classified_by_the_final_error(monkeypatch) -> None:
    store = scripted_store(
        monkeypatch, driver_error(OperationalError), RuntimeError("boom")
    )
    publisher = FakePublisher()
    slept = []

    handle(
        FakeConsumer([], threading.Event()),
        order_record("order.expired", offset=1),
        publisher=publisher,
        delays=(0.5, 1.0, 2.0),
        sleep=slept.append,
    )

    assert store.calls == 2
    assert slept == [0.5]
    assert publisher.published == [(1, "UNEXPECTED_PROCESSING_ERROR", 2)]


def test_empty_backoff_means_a_single_attempt(monkeypatch) -> None:
    store = scripted_store(monkeypatch, driver_error(OperationalError))
    publisher = FakePublisher()

    handle(
        FakeConsumer([], threading.Event()),
        order_record("order.expired", offset=1),
        publisher=publisher,
        delays=(),
    )

    assert store.calls == 1
    assert publisher.published == [(1, "TRANSIENT_RETRIES_EXHAUSTED", 1)]


def test_exception_from_validation_goes_to_the_dlq(monkeypatch) -> None:
    def broken(*_args, **_kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(worker, "process_record", broken)
    consumer = FakeConsumer([], threading.Event())
    publisher = FakePublisher()

    handle(
        consumer,
        order_record("order.expired", offset=3),
        publisher=publisher,
        delays=(0.5,),
    )

    assert publisher.published == [(3, "UNEXPECTED_PROCESSING_ERROR", 1)]
    assert consumer.committed == [3]


def test_failure_log_has_identifiers_but_no_contents(monkeypatch, caplog) -> None:
    scripted_store(monkeypatch, driver_error(DataError))
    event_id, order_id, correlation_id = str(uuid4()), str(uuid4()), str(uuid4())
    message = order_record(
        "order.rejected",
        event_id=event_id,
        order_id=order_id,
        correlation_id=correlation_id,
        reason="SECRET-REASON",
        offset=8,
    )

    with caplog.at_level(logging.DEBUG):
        handle(FakeConsumer([], threading.Event()), message)

    fields = log_fields(caplog, "notification_event_failed")[-1]
    assert fields["failure_code"] == "UNEXPECTED_PROCESSING_ERROR"
    assert fields["attempts"] == 1
    assert fields["exception_type"] == "DataError"
    assert fields["event_id"] == event_id
    assert fields["event_type"] == "order.rejected"
    assert fields["order_id"] == order_id
    assert fields["correlation_id"] == correlation_id
    assert fields["topic"] == "order.events"
    assert fields["offset"] == 8
    assert "SECRET" not in caplog.text


def test_retry_log_has_identifiers_but_no_contents(monkeypatch, caplog) -> None:
    scripted_store(monkeypatch, driver_error(OperationalError), True)
    correlation_id = str(uuid4())
    message = order_record(
        "order.rejected", correlation_id=correlation_id, reason="SECRET-REASON"
    )

    with caplog.at_level(logging.DEBUG):
        handle(
            FakeConsumer([], threading.Event()),
            message,
            delays=(0.5,),
            sleep=lambda _delay: None,
        )

    assert any(
        fields.get("correlation_id") == correlation_id
        for fields in log_fields(caplog, "notification_event_retrying")
    )
    assert "SECRET" not in caplog.text


# --- Publishing to the DLQ ---


def headers_of(record: dict) -> dict:
    return dict(record["headers"])


def test_dlq_record_copies_the_source_and_adds_diagnostics() -> None:
    producer = FakeProducer()
    source_headers = [
        ("event_type", b"order.expired"),
        ("event_id", b"not-text-\xff"),
        ("event_type", b"repeated"),
        ("empty", None),
    ]
    message = FakeMessage(b"\xffkey", b"\x00value", source_headers, offset=41, partition=2)
    before = datetime.now(timezone.utc)

    KafkaPublisher(producer).dead_letter(
        message, failure_code="TRANSIENT_RETRIES_EXHAUSTED", attempts=5
    )

    after = datetime.now(timezone.utc)
    assert len(producer.records) == 1
    record = producer.records[0]
    assert record["topic"] == "notification-service.order-events.dlq"
    assert record["key"] == b"\xffkey"
    assert record["value"] == b"\x00value"
    assert record["headers"][:4] == source_headers
    added = dict(record["headers"][4:])
    failed_at = added.pop("x-notification-failed-at").decode()
    assert added == {
        "x-notification-failure-code": b"TRANSIENT_RETRIES_EXHAUSTED",
        "x-notification-failed-attempts": b"5",
        "x-notification-source-topic": b"order.events",
        "x-notification-source-partition": b"2",
        "x-notification-source-offset": b"41",
    }
    assert failed_at.endswith("Z")
    parsed = datetime.fromisoformat(failed_at)
    assert parsed.utcoffset() == timedelta(0)
    assert before <= parsed <= after


@pytest.mark.parametrize("headers", [None, []])
def test_null_key_and_no_headers_are_copied_as_they_are(headers) -> None:
    producer = FakeProducer()
    message = FakeMessage(None, b"value", headers, offset=1)

    KafkaPublisher(producer).dead_letter(
        message, failure_code="MALFORMED_MESSAGE", attempts=1
    )

    record = producer.records[0]
    assert record["key"] is None
    assert record["value"] == b"value"
    assert [name for name, _ in record["headers"]] == [
        "x-notification-failure-code",
        "x-notification-failed-at",
        "x-notification-failed-attempts",
        "x-notification-source-topic",
        "x-notification-source-partition",
        "x-notification-source-offset",
    ]


def test_null_value_is_copied_as_it_is() -> None:
    producer = FakeProducer()
    consumer = FakeConsumer([], threading.Event())

    handle(
        consumer,
        FakeMessage(None, None, None, offset=1),
        publisher=KafkaPublisher(producer),
    )

    assert producer.records[0]["value"] is None
    assert consumer.committed == [1]


@pytest.mark.parametrize(
    "producer_args",
    [
        pytest.param({"delivery_error": "broker said no"}, id="delivery-error"),
        pytest.param({"remaining": 1, "deliver": False}, id="flush-timed-out"),
        pytest.param({"deliver": False}, id="callback-never-ran"),
    ],
)
def test_unconfirmed_dlq_write_raises(producer_args) -> None:
    publisher = KafkaPublisher(FakeProducer(**producer_args))

    with pytest.raises((KafkaException, RuntimeError)):
        publisher.dead_letter(
            FakeMessage(None, b"v", None), failure_code="MALFORMED_MESSAGE", attempts=1
        )


def test_producer_is_idempotent_and_waits_for_all_replicas(monkeypatch) -> None:
    created = {}
    monkeypatch.setattr(worker, "Producer", lambda config: created.update(config))

    make_producer(make_settings(UNREACHABLE_DB))

    assert created["enable.idempotence"] is True
    assert created["acks"] == "all"
    assert created["bootstrap.servers"] == "unused:9092"
    assert created["message.timeout.ms"] <= worker.PUBLISH_TIMEOUT_SECONDS * 1000
    assert created["message.max.bytes"] == 1_100_000


def test_topic_script_sets_the_same_limit_as_the_producer() -> None:
    script = (SERVICE_ROOT.parent / "event-broker" / "create-topics.sh").read_text()

    assert f"--add-config max.message.bytes={worker.DLQ_MAX_MESSAGE_BYTES}" in script


# --- Commit ordering ---


def test_offset_is_committed_only_after_the_dlq_write_is_confirmed() -> None:
    log = []
    stop = threading.Event()
    consumer = FakeConsumer(
        [FakeMessage(None, b"bad", None, offset=5)],
        stop,
        on_commit=lambda _message: log.append("commit"),
    )

    run_fake(stop, consumer, KafkaPublisher(FakeProducer(log=log)))

    assert log == ["produce", "flush", "commit"]
    assert consumer.committed == [5]
    assert consumer.commit_modes == [False]


@pytest.mark.parametrize(
    "publisher",
    [
        pytest.param(FakePublisher(error=KafkaException("down")), id="raises"),
        pytest.param(
            KafkaPublisher(FakeProducer(delivery_error="broker said no")),
            id="delivery-error",
        ),
        pytest.param(KafkaPublisher(FakeProducer(remaining=1)), id="flush-timed-out"),
    ],
)
def test_dlq_failure_stops_the_worker_without_committing(publisher, caplog) -> None:
    stop = threading.Event()
    bad = FakeMessage(None, b"SECRET", None, offset=5)
    never_reached = order_record("order.created", offset=6)
    consumer = FakeConsumer([bad, never_reached], stop)

    with caplog.at_level(logging.ERROR), pytest.raises(WorkerAbort):
        run_fake(stop, consumer, publisher)

    assert consumer.commit_modes == []
    assert consumer.closed
    fields = log_fields(caplog, "message_dlq_publish_failed")[-1]
    assert fields.get("kafka_error") is None
    assert fields["failure_code"] == "MALFORMED_MESSAGE"
    assert "SECRET" not in caplog.text


@pytest.mark.parametrize(
    ("error", "expected"),
    [
        pytest.param(
            KafkaException(KafkaError(KafkaError.MSG_SIZE_TOO_LARGE)),
            "MSG_SIZE_TOO_LARGE",
            id="kafka-error",
        ),
        pytest.param(KafkaException("no code"), "None", id="kafka-text"),
        pytest.param(RuntimeError("flush timed out"), "None", id="flush-timeout"),
    ],
)
def test_dlq_failure_logs_the_kafka_error_code(error, expected, caplog) -> None:
    consumer = FakeConsumer([], threading.Event())

    with caplog.at_level(logging.ERROR), pytest.raises(WorkerAbort):
        handle(
            consumer,
            FakeMessage(None, b"bad", None, offset=1),
            publisher=FakePublisher(error=error),
        )

    fields = log_fields(caplog, "message_dlq_publish_failed")[-1]
    assert fields.get("kafka_error") == (None if expected == "None" else expected)
    assert fields["failure_code"] == "MALFORMED_MESSAGE"
    assert fields["attempts"] == 1
    assert consumer.commit_modes == []


def test_offset_commit_failure_is_not_itself_sent_to_the_dlq(caplog) -> None:
    consumer = FakeConsumer([], threading.Event(), commit_error=KafkaException("gone"))
    publisher = FakePublisher()

    with caplog.at_level(logging.ERROR), pytest.raises(WorkerAbort):
        handle(consumer, order_record("order.created", offset=3), publisher=publisher)

    assert publisher.published == []
    assert "notification_offset_commit_failed" in caplog.text


def test_offset_commit_failure_after_the_dlq_write_stops_the_worker(caplog) -> None:
    consumer = FakeConsumer([], threading.Event(), commit_error=KafkaException("gone"))
    publisher = FakePublisher()

    with caplog.at_level(logging.ERROR), pytest.raises(WorkerAbort):
        handle(consumer, FakeMessage(None, b"bad", None, offset=3), publisher=publisher)

    assert publisher.published == [(3, "MALFORMED_MESSAGE", 1)]
    assert consumer.committed == []
    fields = log_fields(caplog, "notification_offset_commit_failed")[-1]
    assert fields["failure_code"] == "MALFORMED_MESSAGE"
    assert fields["attempts"] == 1


@pytest.mark.parametrize(
    ("steps", "delays", "code", "attempts"),
    [
        pytest.param(
            [driver_error(OperationalError), driver_error(OperationalError)],
            (0.5,),
            "TRANSIENT_RETRIES_EXHAUSTED",
            2,
            id="retries-exhausted",
        ),
        pytest.param(
            [RuntimeError("boom")], (0.5,), "UNEXPECTED_PROCESSING_ERROR", 1, id="unexpected"
        ),
        pytest.param([True], (), "None", 1, id="stored-has-no-code"),
    ],
)
def test_offset_commit_failure_logs_the_records_failure_code(
    monkeypatch, caplog, steps, delays, code, attempts
) -> None:
    scripted_store(monkeypatch, *steps)
    consumer = FakeConsumer([], threading.Event(), commit_error=KafkaException("gone"))

    with caplog.at_level(logging.ERROR), pytest.raises(WorkerAbort):
        handle(
            consumer,
            order_record("order.expired"),
            delays=delays,
            sleep=lambda _delay: None,
        )

    fields = log_fields(caplog, "notification_offset_commit_failed")[-1]
    assert fields["failure_code"] == (None if code == "None" else code)
    assert fields["attempts"] == attempts


# --- Stopping ---


def test_stop_during_backoff_exits_without_retrying_or_committing(monkeypatch) -> None:
    store = scripted_store(monkeypatch, driver_error(OperationalError))
    stop = threading.Event()
    later = order_record("order.created", offset=8)
    consumer = FakeConsumer([order_record("order.expired", offset=7), later], stop)
    publisher = FakePublisher()
    slept = []

    def stop_while_sleeping(delay):
        slept.append(delay)
        stop.set()

    run(
        make_settings(UNREACHABLE_DB, (0.5, 1.0)),
        stop,
        consumer,
        publisher,
        stop_while_sleeping,
    )

    assert slept == [0.5]
    assert store.calls == 1
    assert publisher.published == []
    assert consumer.commit_modes == []
    assert consumer.closed


def test_stop_during_the_last_attempt_leaves_the_record_for_the_next_run(
    monkeypatch,
) -> None:
    stop = threading.Event()

    def fail_and_stop(_session_factory, _result):
        stop.set()
        raise driver_error(OperationalError)

    monkeypatch.setattr(worker, "store_event", fail_and_stop)
    consumer = FakeConsumer([], stop)
    publisher = FakePublisher()

    handle(consumer, order_record("order.expired"), stop, publisher=publisher)

    assert publisher.published == []
    assert consumer.commit_modes == []


def test_sleep_runs_for_the_whole_delay_when_not_stopped() -> None:
    started = time.monotonic()

    sleep_until_stopped(0.25, threading.Event())

    assert time.monotonic() - started >= 0.25


def test_sigterm_interrupts_the_default_sleep() -> None:
    stop = threading.Event()
    previous = signal.signal(signal.SIGTERM, lambda _signum, _frame: stop.set())
    timer = threading.Timer(0.1, os.kill, (os.getpid(), signal.SIGTERM))
    timer.start()
    started = time.monotonic()
    try:
        sleep_until_stopped(30, stop)
    finally:
        timer.join()
        signal.signal(signal.SIGTERM, previous)

    assert stop.is_set()
    assert time.monotonic() - started < 5


def test_run_uses_the_configured_delays_with_a_real_database_error(caplog) -> None:
    """A real driver failure: nothing listens on UNREACHABLE_DB."""

    stop = threading.Event()
    message = order_record("order.expired", courier_id=BOB, offset=2)
    consumer = FakeConsumer([message], stop)
    publisher = FakePublisher()
    slept = []

    with caplog.at_level(logging.WARNING):
        run(
            make_settings(UNREACHABLE_DB, (0.5, 1.0)),
            stop,
            consumer,
            publisher,
            slept.append,
        )

    assert slept == [0.5, 1.0]
    assert publisher.published == [(2, "TRANSIENT_RETRIES_EXHAUSTED", 3)]
    assert consumer.committed == [2]
    assert any(
        fields["exception_type"] == "OperationalError"
        for fields in log_fields(caplog, "notification_event_retrying")
    )
    assert json.loads(message.value())["payload"]["courier_id"] not in caplog.text


# --- Database timeouts ---


def captured_engine_args(monkeypatch) -> dict:
    captured = {}
    real = db.create_engine

    def recording_create_engine(url, **kwargs):
        captured.update(kwargs["connect_args"])
        return real(url, **kwargs)

    monkeypatch.setattr(db, "create_engine", recording_create_engine)
    return captured


def test_worker_connections_get_the_timeouts(monkeypatch) -> None:
    captured = captured_engine_args(monkeypatch)
    stop = threading.Event()

    run_fake(stop, FakeConsumer([], stop))

    assert captured == {
        "connect_timeout": 3,
        "keepalives": 1,
        "keepalives_idle": 5,
        "keepalives_interval": 2,
        "keepalives_count": 3,
        "tcp_user_timeout": 10000,
        "options": "-c timezone=UTC -c lock_timeout=5s -c statement_timeout=10s",
    }


def test_api_connections_do_not_get_the_timeouts(monkeypatch) -> None:
    captured = captured_engine_args(monkeypatch)
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://nobody@127.0.0.1:1/none")
    monkeypatch.setenv("USER_SERVICE_URL", "https://user-service.test")
    monkeypatch.setenv("USER_SERVICE_CA_FILE", certifi.where())

    with TestClient(create_app()):
        pass

    assert captured == {"connect_timeout": 3, "options": "-c timezone=UTC"}


def test_retry_budget_stays_well_under_max_poll_interval() -> None:
    """Each attempt ends at its first timeout, then the next one must reconnect."""

    attempt_seconds = (
        max(
            db.WORKER_LOCK_TIMEOUT_SECONDS,
            db.WORKER_STATEMENT_TIMEOUT_SECONDS,
            db.WORKER_TCP_USER_TIMEOUT_MILLISECONDS / 1000,
        )
        + db.CONNECT_TIMEOUT_SECONDS
    )
    backoff = DEFAULT_RETRY_BACKOFF_SECONDS

    total = (len(backoff) + 1) * attempt_seconds + sum(backoff)

    assert total == 72.5
    assert total < 300 / 2
