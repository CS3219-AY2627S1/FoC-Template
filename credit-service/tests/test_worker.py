"""Credit Kafka delivery, quarantine, retry, and idempotency tests."""

import json
import logging
from datetime import datetime, timezone
from uuid import UUID, uuid4

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.db import Base
from app.messaging import (
    CREDIT_TOPIC,
    EVENT_STREAMS,
    ORDER_CONSUMER_GROUP,
    ORDER_EVENTS_DLQ,
    ORDER_TOPIC,
)
from app.models import (
    CreditAccount,
    CreditReservation,
    CreditTransaction,
    OutboxEvent,
    ProcessedEvent,
)
from app.services.credits import CreditStateConflict
from app.worker import (
    DeliveryResult,
    KafkaPublisher,
    _handle_message,
    inspect_transport_record,
    process_delivery,
    relay_once,
    selected_stream,
)


class FakeSession:
    def __init__(self):
        self.rollback_count = 0
        self.commit_count = 0
        self.closed = False

    def rollback(self):
        self.rollback_count += 1

    def close(self):
        self.closed = True

    def commit(self):
        self.commit_count += 1


class FakeMessage:
    def __init__(
        self,
        body: bytes,
        *,
        topic: str = ORDER_TOPIC,
        key: bytes | None = None,
        headers: list[tuple[str, bytes | None]] | None = None,
        partition: int = 2,
        offset: int = 17,
        error=None,
    ):
        self._body = body
        self._topic = topic
        self._key = key
        self._headers = headers
        self._partition = partition
        self._offset = offset
        self._error = error

    def value(self):
        return self._body

    def topic(self):
        return self._topic

    def key(self):
        return self._key

    def headers(self):
        return self._headers

    def partition(self):
        return self._partition

    def offset(self):
        return self._offset

    def error(self):
        return self._error


class FakeProducer:
    def __init__(self, *, acknowledge: bool = True, remaining: int = 0):
        self.acknowledge = acknowledge
        self.remaining = remaining
        self.records = []

    def produce(self, **record):
        self.records.append(record)
        if self.acknowledge:
            record["on_delivery"](None, object())

    def flush(self, _timeout):
        return self.remaining


class FakeConsumer:
    def __init__(self, *, commit_error: Exception | None = None):
        self.commit_error = commit_error
        self.commits = []

    def commit(self, **kwargs):
        if self.commit_error is not None:
            raise self.commit_error
        self.commits.append(kwargs)


def event_body(event_type: str, payload: dict) -> bytes:
    return json.dumps(
        {
            "event_id": str(uuid4()),
            "event_type": event_type,
            "schema_version": 1,
            "occurred_at": "2026-10-17T04:00:00Z",
            "correlation_id": str(uuid4()),
            "payload": payload,
        }
    ).encode()


def kafka_message(
    body: bytes,
    *,
    topic: str = ORDER_TOPIC,
    key_field: str = "order_id",
    header_event_type: str | None = None,
) -> FakeMessage:
    envelope = json.loads(body)
    event_type = header_event_type or envelope["event_type"]
    return FakeMessage(
        body,
        topic=topic,
        key=str(envelope["payload"][key_field]).encode(),
        headers=[
            ("event_type", event_type.encode()),
            ("event_id", str(envelope["event_id"]).encode()),
        ],
    )


def order_created_body(requester_id, amount: int = 20) -> bytes:
    return event_body(
        "order.created",
        {
            "order_id": str(uuid4()),
            "requester_id": str(requester_id),
            "credit_amount": amount,
        },
    )


def test_streams_use_stable_groups_and_owned_dlqs(monkeypatch) -> None:
    order = EVENT_STREAMS["order"]
    assert (order.topic, order.group_id, order.dlq_topic) == (
        ORDER_TOPIC,
        ORDER_CONSUMER_GROUP,
        ORDER_EVENTS_DLQ,
    )
    assert set(EVENT_STREAMS) == {"order"}
    monkeypatch.setenv("CREDIT_EVENT_STREAM", "order")
    assert selected_stream() == ("order", order)


def test_valid_unrelated_order_event_is_filtered_before_domain_parser() -> None:
    order_id = uuid4()
    body = event_body("order.picked_up", {"order_id": str(order_id)})
    message = kafka_message(body)

    decision = inspect_transport_record(EVENT_STREAMS["order"], message)

    assert decision.action == "IGNORE"
    assert decision.result is None


def test_header_envelope_mismatch_is_quarantined() -> None:
    body = order_created_body(uuid4())
    message = kafka_message(body, header_event_type="order.completed")

    decision = inspect_transport_record(EVENT_STREAMS["order"], message)

    assert decision.action == "QUARANTINE"
    assert decision.result.failure_code == "MALFORMED_MESSAGE"
    assert decision.result.attempts == 1


def test_missing_header_or_wrong_key_is_quarantined() -> None:
    body = order_created_body(uuid4())
    message = kafka_message(body)
    message._headers = []
    assert inspect_transport_record(EVENT_STREAMS["order"], message).action == (
        "QUARANTINE"
    )

    message = kafka_message(body)
    message._key = str(uuid4()).encode()
    assert inspect_transport_record(EVENT_STREAMS["order"], message).action == (
        "QUARANTINE"
    )


def test_unrelated_event_commits_without_opening_database() -> None:
    order_id = uuid4()
    message = kafka_message(
        event_body("order.accepted", {"order_id": str(order_id)})
    )
    consumer = FakeConsumer()
    publisher = KafkaPublisher(FakeProducer())

    _handle_message(
        lambda: pytest.fail("unrelated events must not open a database session"),
        publisher,
        consumer,
        message,
        stream=EVENT_STREAMS["order"],
        initial_allocation=100,
        retry_backoff_seconds=(),
    )

    assert consumer.commits == [{"message": message, "asynchronous": False}]


def test_malformed_event_is_dead_lettered_without_retry() -> None:
    session = FakeSession()
    sleeps = []

    outcome = process_delivery(
        lambda: session,
        b"not-json",
        initial_allocation=100,
        retry_backoff_seconds=(0.5, 1.0, 2.0),
        sleep=sleeps.append,
    )

    assert outcome.disposition == "QUARANTINE"
    assert outcome.failure_code == "MALFORMED_MESSAGE"
    assert outcome.attempts == 1
    assert sleeps == []
    assert session.rollback_count == 1
    assert session.closed is True


def test_malformed_event_retains_safe_envelope_identifiers() -> None:
    body = order_created_body(uuid4(), amount=0)
    envelope = json.loads(body)

    outcome = process_delivery(
        FakeSession,
        body,
        initial_allocation=100,
        retry_backoff_seconds=(0.5, 1.0),
        sleep=lambda _delay: pytest.fail("Malformed input must not be retried"),
    )

    assert outcome.failure_code == "MALFORMED_MESSAGE"
    assert outcome.event_type == "order.created"
    assert outcome.event_id == UUID(envelope["event_id"])
    assert outcome.correlation_id == UUID(envelope["correlation_id"])
    assert outcome.order_id == UUID(envelope["payload"]["order_id"])


def test_expected_reservation_rejection_is_committed_and_acknowledged(
) -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    requester_id = uuid4()
    with Session(engine) as db:
        db.add(
            CreditAccount(
                user_id=requester_id,
                available_balance=5,
                reserved_balance=0,
                initial_allocation_granted_at=datetime.now(timezone.utc),
            )
        )
        db.commit()

    outcome = process_delivery(
        lambda: Session(engine),
        order_created_body(requester_id),
        initial_allocation=100,
        retry_backoff_seconds=(0.25, 0.75),
        sleep=lambda _delay: pytest.fail("Business rejection must not retry"),
    )

    assert outcome.disposition == "ACK"
    assert outcome.attempts == 1
    with Session(engine) as db:
        audit = db.scalar(select(CreditTransaction))
        outbox = db.scalar(select(OutboxEvent))
        assert audit.outcome == "REJECTED"
        assert audit.reason == "INSUFFICIENT_CREDIT"
        assert outbox.event_type == "credit.reservation_failed"
        assert outbox.payload["reason"] == "INSUFFICIENT_CREDIT"
    engine.dispose()


def test_transient_failure_uses_configured_retry_schedule(
    monkeypatch, caplog
) -> None:
    sessions = []
    sleeps = []

    def session_factory():
        session = FakeSession()
        sessions.append(session)
        return session

    def fail_processing(*_args, **_kwargs):
        raise OperationalError(
            "SELECT 1", {}, ConnectionError("temporary database failure")
        )

    monkeypatch.setattr("app.worker.apply_incoming_event", fail_processing)
    with caplog.at_level(logging.ERROR, logger="app.worker"):
        outcome = process_delivery(
            session_factory,
            order_created_body(uuid4()),
            initial_allocation=100,
            retry_backoff_seconds=(0.25, 0.75),
            sleep=sleeps.append,
        )

    assert outcome.disposition == "QUARANTINE"
    assert outcome.failure_code == "TRANSIENT_RETRIES_EXHAUSTED"
    assert outcome.attempts == 3
    assert sleeps == [0.25, 0.75]
    assert len(sessions) == 3
    assert all(session.rollback_count == 1 for session in sessions)
    assert all(session.closed for session in sessions)
    exhausted = next(
        record for record in caplog.records
        if record.event == "credit_event_retry_exhausted"
    )
    assert exhausted.fields["attempts"] == 3
    completed = next(
        record for record in caplog.records
        if record.event == "credit_event_processing_completed"
    )
    assert completed.fields["duration_ms"] >= 0
    assert completed.fields["outcome"] == "QUARANTINE"


def test_transient_failure_can_recover_on_a_later_attempt(monkeypatch) -> None:
    sessions = []
    sleeps = []
    calls = 0

    def session_factory():
        session = FakeSession()
        sessions.append(session)
        return session

    def fail_then_recover(*_args, **_kwargs):
        nonlocal calls
        calls += 1
        if calls < 3:
            raise OperationalError(
                "SELECT 1", {}, ConnectionError("database restarting")
            )

    monkeypatch.setattr("app.worker.apply_incoming_event", fail_then_recover)
    outcome = process_delivery(
        session_factory,
        order_created_body(uuid4()),
        initial_allocation=100,
        retry_backoff_seconds=(0.25, 0.75, 2.0),
        sleep=sleeps.append,
    )

    assert outcome.disposition == "ACK"
    assert outcome.attempts == 3
    assert sleeps == [0.25, 0.75]
    assert [session.rollback_count for session in sessions] == [1, 1, 0]
    assert [session.commit_count for session in sessions] == [0, 0, 1]
    assert all(session.closed for session in sessions)


@pytest.mark.parametrize(
    ("error", "exception_type"),
    [
        (CreditStateConflict("released reservation"), "CreditStateConflict"),
        (ValueError("invalid deterministic input"), "ValueError"),
    ],
)
def test_deterministic_failure_bypasses_retry(
    monkeypatch, error: Exception, exception_type: str
) -> None:
    session = FakeSession()
    sleeps = []

    def fail_processing(*_args, **_kwargs):
        raise error

    monkeypatch.setattr("app.worker.apply_incoming_event", fail_processing)
    outcome = process_delivery(
        lambda: session,
        order_created_body(uuid4()),
        initial_allocation=100,
        retry_backoff_seconds=(0.25, 0.75),
        sleep=sleeps.append,
    )

    assert outcome.disposition == "QUARANTINE"
    assert outcome.failure_code == "BUSINESS_RULE_VIOLATION"
    assert outcome.exception_type == exception_type
    assert outcome.attempts == 1
    assert sleeps == []
    assert session.rollback_count == 1
    assert session.closed is True


def test_unexpected_runtime_error_is_not_blindly_retried(monkeypatch) -> None:
    session = FakeSession()
    sleeps = []

    monkeypatch.setattr(
        "app.worker.apply_incoming_event",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("bug")),
    )
    outcome = process_delivery(
        lambda: session,
        order_created_body(uuid4()),
        initial_allocation=100,
        retry_backoff_seconds=(0.25, 0.75),
        sleep=sleeps.append,
    )

    assert outcome.failure_code == "UNEXPECTED_PROCESSING_ERROR"
    assert outcome.attempts == 1
    assert sleeps == []


def test_credit_outbox_publish_uses_order_key_headers_and_confirmation() -> None:
    producer = FakeProducer()
    publisher = KafkaPublisher(producer)
    event = OutboxEvent(
        event_id=uuid4(),
        event_type="credit.reserved",
        schema_version=1,
        occurred_at=datetime.now(timezone.utc),
        correlation_id=uuid4(),
        order_id=uuid4(),
        payload={"order_id": str(uuid4())},
    )

    publisher.publish(event)

    record = producer.records[0]
    assert record["topic"] == CREDIT_TOPIC
    assert record["key"] == str(event.order_id).encode()
    assert dict(record["headers"]) == {
        "event_type": b"credit.reserved",
        "event_id": str(event.event_id).encode(),
    }
    assert json.loads(record["value"])["event_id"] == str(event.event_id)


def test_quarantine_preserves_record_and_adds_source_diagnostics(monkeypatch) -> None:
    producer = FakeProducer()
    publisher = KafkaPublisher(producer)
    body = b"original-payload"
    message = FakeMessage(
        body,
        topic=ORDER_TOPIC,
        key=b"order-key",
        headers=[("existing", b"header")],
        partition=1,
        offset=23,
    )
    result = DeliveryResult(
        disposition="QUARANTINE",
        attempts=3,
        failure_code="TRANSIENT_RETRIES_EXHAUSTED",
    )
    monkeypatch.setattr(
        "app.worker.utc_now",
        lambda: datetime(2026, 10, 19, 4, 5, 6, tzinfo=timezone.utc),
    )

    publisher.dead_letter(message, dlq_topic=ORDER_EVENTS_DLQ, result=result)

    record = producer.records[0]
    assert record["topic"] == ORDER_EVENTS_DLQ
    assert record["key"] == b"order-key"
    assert record["value"] is body
    assert dict(record["headers"]) == {
        "existing": b"header",
        "x-credit-failure-code": b"TRANSIENT_RETRIES_EXHAUSTED",
        "x-credit-failed-at": b"2026-10-19T04:05:06Z",
        "x-credit-failed-attempts": b"3",
        "x-credit-source-topic": ORDER_TOPIC.encode(),
        "x-credit-source-partition": b"1",
        "x-credit-source-offset": b"23",
    }


def test_failed_dlq_confirmation_does_not_commit_source_offset() -> None:
    message = FakeMessage(b"not-json", headers=[])
    producer = FakeProducer(acknowledge=False, remaining=1)
    consumer = FakeConsumer()

    with pytest.raises(RuntimeError, match="did not acknowledge"):
        _handle_message(
            FakeSession,
            KafkaPublisher(producer),
            consumer,
            message,
            stream=EVENT_STREAMS["order"],
            initial_allocation=100,
            retry_backoff_seconds=(),
        )

    assert consumer.commits == []


def test_confirmed_dlq_publish_precedes_source_offset_commit(caplog) -> None:
    message = FakeMessage(
        b"not-json",
        topic=ORDER_TOPIC,
        key=b"original-key",
        headers=[("existing", b"header")],
    )
    producer = FakeProducer()
    consumer = FakeConsumer()

    with caplog.at_level(logging.ERROR, logger="app.worker"):
        _handle_message(
            FakeSession,
            KafkaPublisher(producer),
            consumer,
            message,
            stream=EVENT_STREAMS["order"],
            initial_allocation=100,
            retry_backoff_seconds=(),
        )

    assert producer.records[0]["topic"] == ORDER_EVENTS_DLQ
    assert producer.records[0]["key"] == b"original-key"
    assert producer.records[0]["value"] == b"not-json"
    assert consumer.commits == [{"message": message, "asynchronous": False}]
    sent = next(
        record for record in caplog.records
        if record.event == "credit_event_sent_to_dlq"
    )
    assert sent.fields["dlq_topic"] == ORDER_EVENTS_DLQ


def test_unconfirmed_credit_publish_keeps_outbox_pending() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    event = OutboxEvent(
        event_id=uuid4(),
        event_type="credit.reserved",
        schema_version=1,
        occurred_at=datetime.now(timezone.utc),
        correlation_id=uuid4(),
        order_id=uuid4(),
        payload={"order_id": str(uuid4())},
    )
    with Session(engine) as db:
        db.add(event)
        db.commit()
        event_id = event.event_id

    with Session(engine) as db:
        with pytest.raises(RuntimeError, match="did not acknowledge"):
            relay_once(
                db,
                KafkaPublisher(FakeProducer(acknowledge=False, remaining=1)),
            )
        db.rollback()

    with Session(engine) as db:
        stored = db.scalar(select(OutboxEvent).where(OutboxEvent.event_id == event_id))
        assert stored.published_at is None
    engine.dispose()


def test_database_commit_then_offset_failure_is_idempotent_on_redelivery() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    requester_id = uuid4()
    with Session(engine) as db:
        db.add(
            CreditAccount(
                user_id=requester_id,
                available_balance=100,
                reserved_balance=0,
                initial_allocation_granted_at=datetime.now(timezone.utc),
            )
        )
        db.commit()
    body = order_created_body(requester_id, amount=20)
    message = kafka_message(body)
    publisher = KafkaPublisher(FakeProducer())

    with pytest.raises(RuntimeError, match="offset unavailable"):
        _handle_message(
            lambda: Session(engine),
            publisher,
            FakeConsumer(commit_error=RuntimeError("offset unavailable")),
            message,
            stream=EVENT_STREAMS["order"],
            initial_allocation=100,
            retry_backoff_seconds=(),
        )

    consumer = FakeConsumer()
    _handle_message(
        lambda: Session(engine),
        publisher,
        consumer,
        message,
        stream=EVENT_STREAMS["order"],
        initial_allocation=100,
        retry_backoff_seconds=(),
    )

    with Session(engine) as db:
        account = db.get(CreditAccount, requester_id)
        assert (account.available_balance, account.reserved_balance) == (80, 20)
        assert db.scalar(select(func.count()).select_from(CreditReservation)) == 1
        assert db.scalar(select(func.count()).select_from(CreditTransaction)) == 1
        assert db.scalar(select(func.count()).select_from(ProcessedEvent)) == 1
        assert db.scalar(select(func.count()).select_from(OutboxEvent)) == 1
    assert len(consumer.commits) == 1
    engine.dispose()
