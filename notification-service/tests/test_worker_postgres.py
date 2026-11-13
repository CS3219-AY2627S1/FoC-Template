# AI Assistance Disclosure:
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-04
# Scope: Writing implementation code — write worker integration tests against real PostgreSQL with a Kafka test double, covering the acceptance criteria, commit ordering, redelivery, concurrency, LISTEN/NOTIFY, and failures (ai-20261104-003).
# Author review: Keith confirmed verification, with 551 tests passed on the Pytest suite (ai-20261104-003).
# Details: notification-service/ai/usage-log.md; ai-20261104-003
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-05
# Scope: Writing implementation code — update the integration tests for the DLQ, and add tests for unstorable text, recovery, a connection lost mid-transaction, and commit ordering against real PostgreSQL (ai-20261105-001).
# Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16 and Kafka 4.1.2, 645 passed; code manually read and verified; manual checks in an isolated Compose run (ai-20261105-001).
# Details: notification-service/ai/usage-log.md; ai-20261105-001
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-06
# Scope: Writing implementation code — test real lock and statement timeouts through the retry path, and that only the worker's connections have them (ai-20261106-002).
# Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16 and Kafka 4.1.2, 645 passed; code manually read and verified; manual checks in an isolated Compose run (ai-20261106-002).
# Details: notification-service/ai/usage-log.md; ai-20261106-002
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-08
# Scope: Writing implementation code — supply the User Service settings the API now requires (ai-20261108-001).
# Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16, 790 passed and 5 real-broker tests skipped; code read and verified; manual checks against the full Compose stack with the real User Service (ai-20261108-001).
# Details: notification-service/ai/usage-log.md; ai-20261108-001
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-10
# Scope: Writing implementation code — test the per-recipient lock against real PostgreSQL: waiting, other recipients, two recipients, deadlock-free swapped order, lock timeouts through the retry path and DLQ, no drafts, duplicates, a repeated recipient, a hash collision, rollback, and stop while waiting (ai-20261110-001).
# Author review: Keith confirmed on 2026-11-10: verification and testing with the full pytest suite (.venv/bin/python -m pytest -rs), 940 passed (ai-20261110-001).
# Details: notification-service/ai/usage-log.md; ai-20261110-001

"""Worker integration tests: real PostgreSQL, with a Kafka test double.

Set TEST_DATABASE_URL (postgresql+psycopg://...) to a disposable database, as
for tests/test_schema.py. These tests migrate it and delete every row in
``notifications`` and ``processed_events``.
"""

import logging
import os
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

import certifi
import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg.errors import LockNotAvailable
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import DataError, IntegrityError, OperationalError

from app import worker
from app.db import SESSION_OPTIONS, make_engine, make_session_factory
from app.events import BeforeCutoff, Event, NotificationDraft, process_record
from app.main import create_app
from app.worker import (
    RECIPIENT_LOCK_NAMESPACE,
    WorkerAbort,
    handle_message,
    run,
    store_event,
)
from tests.worker_support import (
    ADMIN,
    ALICE,
    BEFORE,
    BOB,
    START_AT,
    FakeConsumer,
    FakeMessage,
    FakePublisher,
    make_settings,
    order_record,
)

SERVICE_ROOT = Path(__file__).resolve().parents[1]
TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not TEST_DATABASE_URL,
    reason="Set TEST_DATABASE_URL to run worker integration tests",
)


@pytest.fixture(scope="module")
def engine():
    assert TEST_DATABASE_URL is not None
    engine = make_engine(TEST_DATABASE_URL)
    with engine.connect() as connection:
        tables = set(
            connection.execute(
                text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
            ).scalars()
        )
    unexpected = tables - {"alembic_version", "notifications", "processed_events"}
    if unexpected:
        engine.dispose()
        pytest.fail(
            f"TEST_DATABASE_URL is not a disposable database; found {sorted(unexpected)}"
        )
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=SERVICE_ROOT,
        env={**os.environ, "DATABASE_URL": TEST_DATABASE_URL},
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    yield engine
    engine.dispose()


@pytest.fixture(autouse=True)
def clean(engine):
    yield
    with engine.begin() as connection:
        connection.execute(text("DELETE FROM notifications"))
        connection.execute(text("DELETE FROM processed_events"))


@pytest.fixture
def session_factory(engine):
    return make_session_factory(engine)


@pytest.fixture
def listener():
    url = TEST_DATABASE_URL.replace("postgresql+psycopg://", "postgresql://", 1)
    with psycopg.connect(url, autocommit=True) as connection:
        connection.execute("LISTEN notifications")
        yield connection


def drain(listener) -> list[str]:
    return [item.payload for item in listener.notifies(timeout=0.5, stop_after=None)]


def counts(engine) -> tuple[int, int]:
    with engine.connect() as connection:
        return (
            connection.scalar(text("SELECT count(*) FROM processed_events")),
            connection.scalar(text("SELECT count(*) FROM notifications")),
        )


def notification_rows(engine) -> set[tuple[str, str, str]]:
    with engine.connect() as connection:
        rows = connection.execute(
            text("SELECT recipient_id, recipient_role, type FROM notifications")
        ).all()
    return {(str(recipient), role, type_) for recipient, role, type_ in rows}


def run_worker(messages, *, publisher=None, **consumer_kwargs) -> FakeConsumer:
    stop = threading.Event()
    consumer = FakeConsumer(messages, stop, **consumer_kwargs)
    # By default a DLQ write fails, which raises, so that it fails the test.
    publisher = publisher or FakePublisher(error=AssertionError("unexpected DLQ write"))
    run(make_settings(TEST_DATABASE_URL), stop, consumer, publisher)
    return consumer


def deliver(
    session_factory,
    consumer,
    message,
    *,
    publisher=None,
    stop=None,
    delays=(),
    sleep=None,
) -> None:
    handle_message(
        session_factory,
        consumer,
        publisher or FakePublisher(error=AssertionError("unexpected DLQ write")),
        message,
        start_at=START_AT,
        retry_backoff_seconds=delays,
        stop=stop or threading.Event(),
        sleep=sleep or (lambda _delay: None),
    )


def order_lifecycle(order_id: str | None = None) -> list[FakeMessage]:
    """Alice creates an order; Bob accepts and picks it up; Alice completes it."""

    order_id = order_id or str(uuid4())
    records = [
        ("order.created", {"credit_amount": 8}),
        ("order.opened", {"credit_amount": 8}),
        ("order.accepted", {"courier_id": BOB}),
        ("order.picked_up", {"courier_id": BOB}),
        ("order.completed", {"courier_id": BOB, "credit_amount": 8}),
    ]
    return [
        order_record(event_type, order_id=order_id, offset=offset, **fields)
        for offset, (event_type, fields) in enumerate(records)
    ]


def cancelled(cancelled_by: str, previous_status: str, **fields) -> FakeMessage:
    return order_record(
        "order.cancelled",
        cancelled_by=cancelled_by,
        previous_status=previous_status,
        **fields,
    )


# --- Acceptance: outcomes ---


def test_full_order_lifecycle_notifies_the_counterparty(engine) -> None:
    consumer = run_worker(order_lifecycle())

    assert notification_rows(engine) == {
        (ALICE, "requester", "order.opened"),
        (ALICE, "requester", "order.accepted"),
        (ALICE, "requester", "order.picked_up"),
        (BOB, "courier", "order.completed"),
    }
    assert counts(engine) == (4, 4)  # order.created is ignored
    assert consumer.committed == [0, 1, 2, 3, 4]
    assert consumer.commit_modes == [False] * 5
    assert consumer.closed


def test_columns_are_copied_from_the_event_and_draft(engine) -> None:
    order_id, event_id = str(uuid4()), str(uuid4())
    run_worker(
        [
            order_record(
                "order.completed",
                order_id=order_id,
                event_id=event_id,
                courier_id=BOB,
                credit_amount=1,
            )
        ]
    )

    with engine.connect() as connection:
        row = connection.execute(text("SELECT * FROM notifications")).mappings().one()
        processed = connection.execute(text("SELECT * FROM processed_events")).mappings().one()
    assert row["event_id"] == UUID(event_id)
    assert row["order_id"] == UUID(order_id)
    assert row["recipient_id"] == UUID(BOB)
    assert row["recipient_role"] == "courier"
    assert row["type"] == "order.completed"
    assert row["params"] == {"credit_amount": 1}
    assert row["title"] == "Order completed"
    assert row["body"] == "Order completed. 1 credit will be added to your balance."
    assert row["occurred_at"].isoformat() == "2026-11-04T00:30:00+00:00"
    assert processed["event_id"] == UUID(event_id)
    assert processed["event_type"] == "order.completed"
    assert processed["processed_at"] is not None


def test_cancelling_open_order_as_requester_writes_only_processed_event(
    engine, listener
) -> None:
    consumer = run_worker([cancelled(ALICE, "OPEN", offset=5)])

    assert counts(engine) == (1, 0)
    assert consumer.committed == [5]
    assert drain(listener) == []


def test_cancelling_accepted_order_as_requester_notifies_the_courier(engine) -> None:
    run_worker([cancelled(ALICE, "ACCEPTED", courier_id=BOB)])

    assert notification_rows(engine) == {(BOB, "courier", "order.cancelled")}
    with engine.connect() as connection:
        params = connection.scalar(text("SELECT params FROM notifications"))
    assert params == {"cancelled_by_role": "requester", "previous_status": "ACCEPTED"}


def test_admin_cancellation_with_courier_writes_two_rows_and_notifies_each(
    engine, listener
) -> None:
    run_worker([cancelled(ADMIN, "ACCEPTED", courier_id=BOB)])

    assert notification_rows(engine) == {
        (ALICE, "requester", "order.cancelled"),
        (BOB, "courier", "order.cancelled"),
    }
    assert drain(listener) == [ALICE, BOB]


# --- Acceptance: the cutoff ---


@pytest.mark.parametrize(
    ("event_type", "fields"),
    [
        pytest.param("order.created", {}, id="created"),
        pytest.param("order.opened", {"credit_amount": 8}, id="opened"),
        pytest.param("order.completed", {"credit_amount": 8}, id="completed-no-courier"),
        pytest.param("order.opened", {"credit_amount": "bad"}, id="invalid-amount"),
    ],
)
def test_events_before_the_cutoff_write_only_processed_events(
    engine, listener, caplog, event_type, fields
) -> None:
    event_id, order_id = str(uuid4()), str(uuid4())
    message = order_record(
        event_type, occurred_at=BEFORE, event_id=event_id, order_id=order_id, offset=4, **fields
    )

    with caplog.at_level(logging.INFO):
        consumer = run_worker([message])

    assert counts(engine) == (1, 0)
    assert consumer.committed == [4]
    assert drain(listener) == []
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT event_type FROM processed_events")) == event_type
    for expected in (
        "notification_event_before_cutoff",
        f"event_id={event_id}",
        f"event_type='{event_type}'",
        f"order_id={order_id}",
        "topic=order.events",
        "partition=0",
        "offset=4",
    ):
        assert expected in caplog.text


def test_duplicate_before_the_cutoff_commits_the_offset(engine) -> None:
    event_id = str(uuid4())
    first = order_record("order.created", occurred_at=BEFORE, event_id=event_id, offset=1)
    again = order_record("order.created", occurred_at=BEFORE, event_id=event_id, offset=2)

    consumer = run_worker([first, again])

    assert counts(engine) == (1, 0)
    assert consumer.committed == [1, 2]


def test_malformed_before_the_cutoff_goes_to_the_dlq(engine) -> None:
    good = order_record("order.created", occurred_at=BEFORE)
    malformed = FakeMessage(None, good.value(), good.headers(), offset=6)
    publisher = FakePublisher()

    consumer = run_worker([malformed], publisher=publisher)

    assert counts(engine) == (0, 0)
    assert publisher.published == [(6, "MALFORMED_MESSAGE", 1)]
    assert consumer.committed == [6]


def test_record_at_the_cutoff_is_translated(engine) -> None:
    run_worker(
        [order_record("order.expired", occurred_at=START_AT.isoformat())]
    )

    assert notification_rows(engine) == {(ALICE, "requester", "order.expired")}


# --- Acceptance: redelivery and ordering ---


def test_replay_from_earliest_leaves_row_counts_unchanged(engine, listener) -> None:
    messages = order_lifecycle()
    run_worker(messages)
    before = counts(engine)
    assert sorted(drain(listener)) == sorted([ALICE, ALICE, ALICE, BOB])

    replay = run_worker(messages)

    assert counts(engine) == before
    assert replay.committed == [0, 1, 2, 3, 4]
    assert drain(listener) == []


def test_offset_is_committed_synchronously_only_after_the_transaction(
    engine,
) -> None:
    """Prove commit order from a separate connection, inside the Kafka commit."""

    seen = []

    def on_commit(message):
        seen.append((message.offset(), counts(engine)))

    messages = [
        order_record("order.opened", credit_amount=8, offset=0),
        order_record("order.accepted", courier_id=BOB, offset=1),
        order_record("order.created", offset=2),
        order_record("order.created", occurred_at=BEFORE, offset=3),
    ]
    consumer = run_worker(messages, on_commit=on_commit)

    assert seen == [(0, (1, 1)), (1, (2, 2)), (2, (2, 2)), (3, (3, 2))]
    assert consumer.commit_modes == [False] * 4


def test_crash_between_database_commit_and_offset_commit_is_a_duplicate_on_restart(
    engine, caplog
) -> None:
    message = order_record("order.expired", offset=2)
    stop = threading.Event()
    crashing = FakeConsumer([message], stop, commit_error=RuntimeError("broker gone"))

    with pytest.raises(WorkerAbort):
        run(make_settings(TEST_DATABASE_URL), stop, crashing, FakePublisher())

    assert crashing.closed
    assert crashing.committed == []
    assert counts(engine) == (1, 1)

    with caplog.at_level(logging.INFO):
        restarted = run_worker([message])

    assert counts(engine) == (1, 1)
    assert restarted.committed == [2]
    assert "notification_event_duplicate" in caplog.text


def test_concurrent_deliveries_create_one_set_of_rows(engine, session_factory) -> None:
    message = cancelled(ADMIN, "ACCEPTED", courier_id=BOB, offset=3)
    barrier = threading.Barrier(8)
    consumers = [FakeConsumer([], threading.Event()) for _ in range(8)]
    failures = []

    def deliver_one(consumer):
        barrier.wait()
        try:
            deliver(session_factory, consumer, message)
        except BaseException as error:  # noqa: BLE001 - reported on the main thread
            failures.append(error)

    threads = [threading.Thread(target=deliver_one, args=(c,)) for c in consumers]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)

    assert failures == []
    assert counts(engine) == (1, 2)
    assert [consumer.committed for consumer in consumers] == [[3]] * 8


def test_delivery_blocked_by_a_concurrent_transaction_becomes_a_duplicate(
    engine, session_factory
) -> None:
    result_event_id = uuid4()
    message = order_record("order.expired", event_id=str(result_event_id), offset=8)
    consumer = FakeConsumer([], threading.Event())
    holder = engine.connect()
    holder_transaction = holder.begin()
    holder.execute(
        text(
            "INSERT INTO processed_events (event_id, event_type, processed_at) "
            "VALUES (:event_id, 'order.expired', now())"
        ),
        {"event_id": result_event_id},
    )

    thread = threading.Thread(target=deliver, args=(session_factory, consumer, message))
    thread.start()
    try:
        deadline = time.monotonic() + 10
        blocked = 0
        while not blocked and time.monotonic() < deadline:
            with engine.connect() as connection:
                blocked = connection.scalar(
                    text(
                        "SELECT count(*) FROM pg_stat_activity "
                        "WHERE wait_event_type = 'Lock' AND datname = current_database()"
                    )
                )
        assert blocked == 1
        assert consumer.committed == []
    finally:
        holder_transaction.commit()
        holder.close()
        thread.join(timeout=10)

    assert consumer.committed == [8]
    assert counts(engine) == (1, 0)


# --- Acceptance: NOTIFY ---


def test_listener_gets_one_notification_per_recipient_only_after_commit(
    engine, session_factory, listener
) -> None:
    before_commit = []

    def check_before_commit(_session):
        before_commit.append(drain(listener))
        before_commit.append(counts(engine))

    event.listen(session_factory, "before_commit", check_before_commit)
    message = cancelled(ADMIN, "ACCEPTED", courier_id=BOB)
    consumer = FakeConsumer([], threading.Event())

    deliver(session_factory, consumer, message)

    assert before_commit == [[], (0, 0)]
    assert drain(listener) == [ALICE, BOB]


# --- Failures and stopping ---


UNSTORABLE = [
    pytest.param("SECRET\u0000REASON", id="nul"),
    pytest.param("SECRET\ud800REASON", id="lone-surrogate"),
]


def rejected(text_value: str, **fields) -> FakeMessage:
    return order_record("order.rejected", reason=text_value, **fields)


@pytest.mark.parametrize("bad_text", UNSTORABLE)
@pytest.mark.parametrize(
    "make_record",
    [
        pytest.param(rejected, id="rejected-reason"),
        pytest.param(
            lambda bad, **fields: cancelled(ALICE, bad, courier_id=BOB, **fields),
            id="cancelled-by-requester-one-draft",
        ),
        pytest.param(
            lambda bad, **fields: cancelled(ADMIN, bad, **fields),
            id="cancelled-by-admin-one-draft",
        ),
        pytest.param(
            lambda bad, **fields: cancelled(ADMIN, bad, courier_id=BOB, **fields),
            id="cancelled-by-admin-two-drafts",
        ),
    ],
)
def test_unstorable_text_goes_to_the_dlq_after_one_attempt(
    engine, listener, caplog, make_record, bad_text
) -> None:
    message = make_record(bad_text, offset=11)
    later = order_record("order.expired", offset=12)
    stop = threading.Event()
    consumer = FakeConsumer([message], stop)
    publisher = FakePublisher()
    slept = []

    # Backoff is configured, to prove this failure class does not use it.
    with caplog.at_level(logging.DEBUG):
        run(
            make_settings(TEST_DATABASE_URL, (0.5, 1.0)),
            stop,
            consumer,
            publisher,
            slept.append,
        )

    assert slept == []
    assert publisher.published == [(11, "UNEXPECTED_PROCESSING_ERROR", 1)]
    assert consumer.committed == [11]
    assert counts(engine) == (0, 0)
    assert drain(listener) == []
    assert "exception_type=DataError" in caplog.text
    assert "SECRET" not in caplog.text

    # The partition is not blocked.
    assert run_worker([later]).committed == [12]
    assert counts(engine) == (1, 1)


@pytest.mark.parametrize("bad_text", UNSTORABLE)
def test_unstorable_text_with_no_drafts_is_processed_normally(engine, bad_text) -> None:
    """Nothing reaches params if the event notifies nobody."""

    consumer = run_worker([cancelled(ALICE, bad_text, offset=3)])

    assert consumer.committed == [3]
    assert counts(engine) == (1, 0)


def test_unstorable_text_before_the_cutoff_is_processed_normally(engine) -> None:
    consumer = run_worker([rejected("bad\u0000", occurred_at=BEFORE, offset=3)])

    assert consumer.committed == [3]
    assert counts(engine) == (1, 0)


def test_failure_after_processed_event_insert_leaves_no_partial_rows(
    engine, monkeypatch, listener
) -> None:
    def failing_text(_statement):
        raise RuntimeError("boom")

    monkeypatch.setattr(worker, "text", failing_text)
    publisher = FakePublisher()

    consumer = run_worker([order_record("order.expired", offset=1)], publisher=publisher)

    monkeypatch.undo()
    assert counts(engine) == (0, 0)
    assert publisher.published == [(1, "UNEXPECTED_PROCESSING_ERROR", 1)]
    assert consumer.committed == [1]
    assert drain(listener) == []


def test_offset_is_committed_after_the_dlq_write_and_rollback(engine) -> None:
    seen = []

    def on_publish(_message):
        seen.append(("dlq", counts(engine)))

    def on_commit(_message):
        seen.append(("commit", counts(engine)))

    run_worker(
        [rejected("bad\u0000", offset=1)],
        publisher=FakePublisher(on_publish=on_publish),
        on_commit=on_commit,
    )

    assert seen == [("dlq", (0, 0)), ("commit", (0, 0))]


def test_dlq_failure_stops_the_worker_and_the_record_is_reprocessed(engine) -> None:
    message = rejected("bad\u0000", offset=1)
    stop = threading.Event()
    failing = FakeConsumer([message], stop)

    with pytest.raises(WorkerAbort):
        run(
            make_settings(TEST_DATABASE_URL),
            stop,
            failing,
            FakePublisher(error=RuntimeError("broker down")),
        )

    assert failing.commit_modes == []
    assert failing.closed

    publisher = FakePublisher()
    restarted = run_worker([message], publisher=publisher)

    assert publisher.published == [(1, "UNEXPECTED_PROCESSING_ERROR", 1)]
    assert restarted.committed == [1]


def test_duplicate_is_not_a_failure(engine, listener) -> None:
    event_id = str(uuid4())
    first = order_record("order.expired", event_id=event_id, offset=1)
    again = order_record("order.expired", event_id=event_id, offset=2)
    publisher = FakePublisher()
    stop = threading.Event()
    consumer = FakeConsumer([first, again], stop)
    slept = []

    run(make_settings(TEST_DATABASE_URL, (0.5,)), stop, consumer, publisher, slept.append)

    assert counts(engine) == (1, 1)
    assert consumer.committed == [1, 2]
    assert publisher.published == []
    assert slept == []
    assert drain(listener) == [ALICE]


# --- Transient failures with a real connection ---


def unreachable_then(session_factory, failures: int):
    """Session factory for a database that is down for the first ``failures`` uses."""

    dead_engine = make_engine("postgresql+psycopg://nobody@127.0.0.1:1/none")
    dead_factory = make_session_factory(dead_engine)
    calls = {"count": 0}

    def factory():
        calls["count"] += 1
        return dead_factory() if calls["count"] <= failures else session_factory()

    factory.calls = calls
    return factory


def test_database_recovering_within_the_retry_window_creates_the_notification(
    engine, session_factory, listener
) -> None:
    factory = unreachable_then(session_factory, failures=2)
    consumer = FakeConsumer([], threading.Event())
    publisher = FakePublisher()
    slept = []

    deliver(
        factory,
        consumer,
        order_record("order.expired", offset=9),
        publisher=publisher,
        delays=(0.5, 1.0, 2.0),
        sleep=slept.append,
    )

    assert factory.calls["count"] == 3
    assert slept == [0.5, 1.0]
    assert counts(engine) == (1, 1)
    assert publisher.published == []
    assert consumer.committed == [9]
    assert drain(listener) == [ALICE]


def test_database_down_for_every_attempt_goes_to_the_dlq(engine, session_factory) -> None:
    factory = unreachable_then(session_factory, failures=99)
    consumer = FakeConsumer([], threading.Event())
    publisher = FakePublisher()
    slept = []

    deliver(
        factory,
        consumer,
        order_record("order.expired", offset=9),
        publisher=publisher,
        delays=(0.5, 1.0),
        sleep=slept.append,
    )

    assert factory.calls["count"] == 3
    assert slept == [0.5, 1.0]
    assert publisher.published == [(9, "TRANSIENT_RETRIES_EXHAUSTED", 3)]
    assert consumer.committed == [9]
    assert counts(engine) == (0, 0)


@pytest.mark.parametrize(
    ("kills", "expected_counts", "expected_dlq"),
    [
        pytest.param(1, (1, 2), [], id="recovers"),
        pytest.param(2, (0, 0), [(4, "TRANSIENT_RETRIES_EXHAUSTED", 2)], id="exhausted"),
    ],
)
def test_connection_lost_mid_transaction_leaves_no_partial_rows(
    engine, session_factory, listener, kills, expected_counts, expected_dlq
) -> None:
    """Terminate the backend after every row is flushed, just before COMMIT."""

    observed = []

    def kill_backend(session):
        if len(observed) >= kills:
            return
        pid = session.connection().scalar(text("SELECT pg_backend_pid()"))
        observed.append(counts(engine))  # Another connection sees nothing yet.
        with engine.connect() as admin:
            admin.execute(text("SELECT pg_terminate_backend(:pid)"), {"pid": pid})
            admin.commit()
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            with engine.connect() as admin:
                alive = admin.scalar(
                    text("SELECT count(*) FROM pg_stat_activity WHERE pid = :pid"),
                    {"pid": pid},
                )
            if not alive:
                return
        raise AssertionError("backend did not terminate")

    event.listen(session_factory, "before_commit", kill_backend)
    consumer = FakeConsumer([], threading.Event())
    publisher = FakePublisher()
    slept = []

    deliver(
        session_factory,
        consumer,
        cancelled(ADMIN, "ACCEPTED", courier_id=BOB, offset=4),
        publisher=publisher,
        delays=(0.5,),
        sleep=slept.append,
    )

    assert slept == [0.5]
    assert observed == [(0, 0)] * kills
    assert counts(engine) == expected_counts
    assert publisher.published == expected_dlq
    assert consumer.committed == [4]
    assert drain(listener) == ([ALICE, BOB] if not expected_dlq else [])


def test_stop_during_backoff_leaves_no_rows_and_no_commit(engine, session_factory) -> None:
    factory = unreachable_then(session_factory, failures=99)
    stop = threading.Event()
    consumer = FakeConsumer([], stop)
    publisher = FakePublisher()

    deliver(
        factory,
        consumer,
        order_record("order.expired"),
        publisher=publisher,
        stop=stop,
        delays=(0.5, 1.0),
        sleep=lambda _delay: stop.set(),
    )

    assert factory.calls["count"] == 1
    assert counts(engine) == (0, 0)
    assert publisher.published == []
    assert consumer.commit_modes == []


# --- Database timeouts ---


@pytest.fixture
def worker_session_factory():
    engine = make_engine(TEST_DATABASE_URL, worker_timeouts=True)
    yield make_session_factory(engine)
    engine.dispose()


def session_settings(connection) -> tuple[str, str, str]:
    return (
        connection.scalar(text("SHOW lock_timeout")),
        connection.scalar(text("SHOW statement_timeout")),
        connection.scalar(text("SHOW timezone")),
    )


def test_worker_engine_applies_the_timeouts_to_real_connections() -> None:
    engine = make_engine(TEST_DATABASE_URL, worker_timeouts=True)
    try:
        with engine.connect() as connection:
            assert session_settings(connection) == ("5s", "10s", "UTC")
            parameters = connection.connection.driver_connection.info.get_parameters()
    finally:
        engine.dispose()

    assert parameters["keepalives"] == "1"
    assert parameters["keepalives_idle"] == "5"
    assert parameters["keepalives_interval"] == "2"
    assert parameters["keepalives_count"] == "3"
    assert parameters["tcp_user_timeout"] == "10000"


def test_api_engine_has_no_timeouts_on_real_connections(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", TEST_DATABASE_URL)
    monkeypatch.setenv("USER_SERVICE_URL", "https://user-service.test")
    monkeypatch.setenv("USER_SERVICE_CA_FILE", certifi.where())

    with TestClient(create_app()) as client:
        with client.app.state.engine.connect() as connection:
            assert session_settings(connection) == ("0", "0", "UTC")
            parameters = connection.connection.driver_connection.info.get_parameters()

    assert not {
        "keepalives",
        "keepalives_idle",
        "keepalives_interval",
        "keepalives_count",
        "tcp_user_timeout",
    } & set(parameters)


@pytest.fixture
def notifications_locked(engine):
    """Block inserts into notifications, after processed_events has been written."""

    holder = engine.connect()
    transaction = holder.begin()
    # SHARE conflicts with INSERT, and still lets counts() read.
    holder.execute(text("LOCK TABLE notifications IN SHARE MODE"))

    def release():
        if transaction.is_active:
            transaction.rollback()

    yield release
    release()
    holder.close()


def test_lock_wait_times_out_retries_and_leaves_no_partial_rows(
    engine, worker_session_factory, notifications_locked, listener, caplog
) -> None:
    consumer = FakeConsumer([], threading.Event())
    publisher = FakePublisher()
    during_backoff = []

    with caplog.at_level(logging.WARNING):
        deliver(
            worker_session_factory,
            consumer,
            order_record("order.expired", offset=2),
            publisher=publisher,
            delays=(0.5,),
            sleep=lambda _delay: during_backoff.append(counts(engine)),
        )

    assert during_backoff == [(0, 0)]
    assert counts(engine) == (0, 0)
    assert publisher.published == [(2, "TRANSIENT_RETRIES_EXHAUSTED", 2)]
    assert consumer.committed == [2]
    assert drain(listener) == []
    assert "notification_event_retrying attempt=1" in caplog.text
    assert "sqlstate=55P03" in caplog.text


def test_lock_released_within_the_retry_window_creates_the_notification(
    engine, worker_session_factory, notifications_locked
) -> None:
    consumer = FakeConsumer([], threading.Event())
    publisher = FakePublisher()

    deliver(
        worker_session_factory,
        consumer,
        order_record("order.expired", offset=2),
        publisher=publisher,
        delays=(0.5,),
        sleep=lambda _delay: notifications_locked(),
    )

    assert counts(engine) == (1, 1)
    assert publisher.published == []
    assert consumer.committed == [2]


def test_statement_timeout_retries_and_leaves_no_partial_rows(
    engine, worker_session_factory, caplog
) -> None:
    """The first attempt stalls with every row flushed, just before COMMIT."""

    stalled = []

    def stall_once(session):
        if not stalled:
            stalled.append(True)
            session.execute(text("SELECT pg_sleep(30)"))

    event.listen(worker_session_factory, "before_commit", stall_once)
    consumer = FakeConsumer([], threading.Event())
    publisher = FakePublisher()
    during_backoff = []

    with caplog.at_level(logging.WARNING):
        deliver(
            worker_session_factory,
            consumer,
            order_record("order.expired", offset=2),
            publisher=publisher,
            delays=(0.5,),
            sleep=lambda _delay: during_backoff.append(counts(engine)),
        )

    assert during_backoff == [(0, 0)]
    assert counts(engine) == (1, 1)
    assert publisher.published == []
    assert consumer.committed == [2]
    assert "sqlstate=57014" in caplog.text


def test_other_unique_violation_is_not_treated_as_a_duplicate(
    engine, session_factory
) -> None:
    """Only the processed_events key means already processed."""

    draft = NotificationDraft(UUID(ALICE), "requester", "order.expired", {}, "t", "b")
    result = Event(
        event_id=uuid4(),
        event_type="order.expired",
        occurred_at=datetime.now(timezone.utc),
        order_id=uuid4(),
        correlation_id=uuid4(),
        drafts=[draft, draft],
    )

    with pytest.raises(Exception, match="uq_notifications_event_recipient"):
        store_event(session_factory, result)
    assert counts(engine) == (0, 0)


def test_sigterm_mid_record_keeps_the_transaction_but_not_the_offset(
    engine, monkeypatch, session_factory
) -> None:
    stop = threading.Event()
    consumer = FakeConsumer([], stop)
    real_store = worker.store_event

    def store_then_signal(*args):
        stored = real_store(*args)
        stop.set()
        return stored

    monkeypatch.setattr(worker, "store_event", store_then_signal)
    message = order_record("order.expired", offset=4)

    deliver(session_factory, consumer, message, stop=stop)

    assert counts(engine) == (1, 1)
    assert consumer.commit_modes == []


def test_outcome_log_includes_every_identifier(engine, caplog) -> None:
    event_id, order_id = str(uuid4()), str(uuid4())
    message = order_record("order.expired", event_id=event_id, order_id=order_id, offset=12)

    with caplog.at_level(logging.INFO):
        run_worker([message])

    for expected in (
        "notification_event_stored",
        f"event_id={event_id}",
        "event_type='order.expired'",
        f"order_id={order_id}",
        "notifications=1",
        "topic=order.events",
        "partition=0",
        "offset=12",
    ):
        assert expected in caplog.text


# --- Per-recipient lock ---

# Two recipient ids with the same hashtext(), so the same lock key.
COLLIDING_RECIPIENTS = (
    "53357027-c34f-4705-98d4-34e124e043e1",
    "7dc908c5-acc3-469c-93ee-9bcaacdd8cac",
)
LOCK_SQL = text("SELECT pg_advisory_xact_lock(:namespace, hashtext(:recipient_id))")
TRY_LOCK_SQL = text(
    "SELECT pg_try_advisory_xact_lock(:namespace, hashtext(:recipient_id))"
)
WAIT_SECONDS = 10


def lock_params(recipient_id: str) -> dict:
    return {"namespace": RECIPIENT_LOCK_NAMESPACE, "recipient_id": recipient_id}


def parse(message: FakeMessage):
    return process_record(
        message.key(), message.value(), message.headers(), start_at=START_AT
    )


@pytest.fixture
def short_lock_session_factory():
    """Like the worker's sessions, with a lock_timeout short enough for tests.

    Tests that expect no wait use it too, so that a wrong wait fails quickly
    instead of hanging.
    """

    engine = create_engine(
        TEST_DATABASE_URL,
        connect_args={"options": f"{SESSION_OPTIONS} -c lock_timeout=500ms"},
    )
    yield make_session_factory(engine)
    engine.dispose()


@pytest.fixture
def hold_recipient_locks(engine):
    """Take recipients' locks in a separate session, as another worker would.

    Returns a function that commits that session, releasing the locks.
    """

    held = []

    def hold(*recipient_ids: str):
        connection = engine.connect()
        transaction = connection.begin()
        held.append((connection, transaction))
        for recipient_id in recipient_ids:
            connection.execute(LOCK_SQL, lock_params(recipient_id))

        def release():
            if transaction.is_active:
                transaction.commit()

        return release

    yield hold
    for connection, transaction in held:
        if transaction.is_active:
            transaction.rollback()
        connection.close()


@pytest.fixture
def lock_requests():
    """The recipient ids of every recipient lock requested, in request order."""

    requested: list[str] = []

    def record(_conn, _cursor, statement, parameters, _context, _many):
        if "pg_advisory_xact_lock" in statement:
            assert parameters["namespace"] == RECIPIENT_LOCK_NAMESPACE
            requested.append(parameters["recipient_id"])

    event.listen(Engine, "before_cursor_execute", record)
    yield requested
    event.remove(Engine, "before_cursor_execute", record)


def wait_for_advisory_waiters(engine, expected: int) -> int:
    """Poll until ``expected`` sessions wait on an advisory lock, or time out."""

    deadline = time.monotonic() + WAIT_SECONDS
    waiting = 0
    while time.monotonic() < deadline:
        with engine.connect() as connection:
            waiting = connection.scalar(
                text(
                    "SELECT count(*) FROM pg_stat_activity "
                    "WHERE wait_event_type = 'Lock' AND wait_event = 'advisory' "
                    "AND datname = current_database()"
                )
            )
        if waiting >= expected:
            break
    return waiting


def store_in_thread(session_factory, result) -> tuple[threading.Thread, dict]:
    outcome: dict = {}

    def target():
        try:
            outcome["stored"] = store_event(session_factory, result)
        except BaseException as error:  # noqa: BLE001 - reported on the main thread
            outcome["error"] = error

    thread = threading.Thread(target=target)
    thread.start()
    return thread, outcome


def test_store_waits_for_the_recipient_lock_held_elsewhere(
    engine, session_factory, hold_recipient_locks, listener
) -> None:
    release = hold_recipient_locks(ALICE)

    thread, outcome = store_in_thread(session_factory, parse(order_record("order.expired")))
    try:
        assert wait_for_advisory_waiters(engine, 1) == 1
        assert thread.is_alive()
        assert outcome == {}
        assert counts(engine) == (0, 0)
        assert drain(listener) == []
    finally:
        release()
        thread.join(timeout=WAIT_SECONDS)

    assert not thread.is_alive()
    assert outcome == {"stored": True}
    assert notification_rows(engine) == {(ALICE, "requester", "order.expired")}
    assert drain(listener) == [ALICE]


def test_lock_on_another_recipient_does_not_block(
    engine, short_lock_session_factory, hold_recipient_locks
) -> None:
    hold_recipient_locks(ALICE)
    result = parse(cancelled(ALICE, "ACCEPTED", courier_id=BOB))

    assert store_event(short_lock_session_factory, result) is True
    assert notification_rows(engine) == {(BOB, "courier", "order.cancelled")}


@pytest.mark.parametrize("held", [ALICE, BOB], ids=["requester", "courier"])
def test_event_with_two_recipients_waits_for_either_lock(
    engine, session_factory, hold_recipient_locks, held
) -> None:
    release = hold_recipient_locks(held)
    result = parse(cancelled(ADMIN, "ACCEPTED", courier_id=BOB))

    thread, outcome = store_in_thread(session_factory, result)
    try:
        assert wait_for_advisory_waiters(engine, 1) == 1
        assert thread.is_alive()
        assert counts(engine) == (0, 0)
    finally:
        release()
        thread.join(timeout=WAIT_SECONDS)

    assert outcome == {"stored": True}
    assert notification_rows(engine) == {
        (ALICE, "requester", "order.cancelled"),
        (BOB, "courier", "order.cancelled"),
    }


@pytest.mark.parametrize(
    ("requester", "courier"), [(ALICE, BOB), (BOB, ALICE)], ids=["alice-bob", "bob-alice"]
)
def test_locks_are_requested_once_each_in_sorted_order(
    engine, session_factory, lock_requests, requester, courier
) -> None:
    result = parse(
        cancelled(ADMIN, "ACCEPTED", requester_id=requester, courier_id=courier)
    )

    assert store_event(session_factory, result) is True
    assert lock_requests == sorted([ALICE, BOB])


def test_swapped_recipients_stored_concurrently_do_not_deadlock(
    engine, session_factory, hold_recipient_locks
) -> None:
    """Both stores start waiting while a third session holds both locks.

    When it commits, both locks are free at once. Taken in each event's own
    order (requester first), each store would get one lock and wait for the
    other, a deadlock. In a fixed order they wait on the same first lock.
    """

    release = hold_recipient_locks(ALICE, BOB)
    first = parse(cancelled(ADMIN, "ACCEPTED", requester_id=ALICE, courier_id=BOB))
    second = parse(cancelled(ADMIN, "ACCEPTED", requester_id=BOB, courier_id=ALICE))

    stores = [store_in_thread(session_factory, result) for result in (first, second)]
    try:
        assert wait_for_advisory_waiters(engine, 2) == 2
    finally:
        release()
        for thread, _outcome in stores:
            thread.join(timeout=WAIT_SECONDS)

    assert [outcome for _thread, outcome in stores] == [{"stored": True}] * 2
    assert counts(engine) == (2, 4)


def test_recipient_lock_timeout_is_classified_as_transient(
    engine, short_lock_session_factory, hold_recipient_locks
) -> None:
    hold_recipient_locks(ALICE)

    with pytest.raises(OperationalError) as raised:
        store_event(short_lock_session_factory, parse(order_record("order.expired")))

    assert isinstance(raised.value.orig, LockNotAvailable)
    assert worker._is_transient(raised.value)
    assert counts(engine) == (0, 0)


def test_recipient_lock_timeout_retries_then_goes_to_the_dlq(
    engine, short_lock_session_factory, hold_recipient_locks, listener, caplog
) -> None:
    hold_recipient_locks(ALICE)
    consumer = FakeConsumer([], threading.Event())
    publisher = FakePublisher()
    backoffs = []

    with caplog.at_level(logging.WARNING):
        deliver(
            short_lock_session_factory,
            consumer,
            order_record("order.expired", offset=2),
            publisher=publisher,
            delays=(0.5,),
            sleep=lambda delay: backoffs.append((delay, counts(engine))),
        )

    assert backoffs == [(0.5, (0, 0))]
    assert counts(engine) == (0, 0)
    assert publisher.published == [(2, "TRANSIENT_RETRIES_EXHAUSTED", 2)]
    assert consumer.committed == [2]
    assert drain(listener) == []
    assert "notification_event_retrying attempt=1" in caplog.text
    assert "sqlstate=55P03" in caplog.text


def test_recipient_lock_released_within_the_retry_window_stores_the_event(
    engine, short_lock_session_factory, hold_recipient_locks
) -> None:
    release = hold_recipient_locks(ALICE)
    consumer = FakeConsumer([], threading.Event())
    publisher = FakePublisher()

    deliver(
        short_lock_session_factory,
        consumer,
        order_record("order.expired", offset=2),
        publisher=publisher,
        delays=(0.5,),
        sleep=lambda _delay: release(),
    )

    assert counts(engine) == (1, 1)
    assert publisher.published == []
    assert consumer.committed == [2]


@pytest.mark.parametrize(
    "message",
    [
        pytest.param(order_record("order.expired", occurred_at=BEFORE), id="before-cutoff"),
        pytest.param(cancelled(ALICE, "OPEN"), id="no-notification"),
    ],
)
def test_events_without_drafts_request_no_recipient_lock(
    engine, short_lock_session_factory, hold_recipient_locks, lock_requests, message
) -> None:
    hold_recipient_locks(ALICE)
    lock_requests.clear()
    result = parse(message)
    assert isinstance(result, BeforeCutoff) or result.drafts == []

    assert store_event(short_lock_session_factory, result) is True
    assert lock_requests == []
    assert counts(engine) == (1, 0)


def test_duplicate_requests_no_recipient_lock(
    engine, session_factory, short_lock_session_factory, hold_recipient_locks, lock_requests
) -> None:
    result = parse(order_record("order.expired"))
    assert store_event(session_factory, result) is True
    hold_recipient_locks(ALICE)
    lock_requests.clear()

    assert store_event(short_lock_session_factory, result) is False
    assert lock_requests == []
    assert counts(engine) == (1, 1)


def test_recipient_in_two_drafts_is_locked_once(
    engine, session_factory, lock_requests
) -> None:
    drafts = [
        NotificationDraft(UUID(ALICE), role, "order.expired", {}, "t", "b")
        for role in ("requester", "courier")
    ]
    result = Event(
        event_id=uuid4(),
        event_type="order.expired",
        occurred_at=datetime.now(timezone.utc),
        order_id=uuid4(),
        correlation_id=uuid4(),
        drafts=drafts,
    )

    # The insert then fails on the one-row-per-recipient constraint.
    with pytest.raises(IntegrityError, match="uq_notifications_event_recipient"):
        store_event(session_factory, result)
    assert lock_requests == [ALICE]


def test_recipients_with_the_same_lock_key_do_not_block_each_other(
    engine, short_lock_session_factory, lock_requests
) -> None:
    with engine.connect() as connection:
        hashes = {
            connection.scalar(text("SELECT hashtext(:r)"), {"r": recipient})
            for recipient in COLLIDING_RECIPIENTS
        }
    assert len(hashes) == 1
    drafts = [
        NotificationDraft(UUID(recipient), role, "order.cancelled", {}, "t", "b")
        for recipient, role in zip(COLLIDING_RECIPIENTS, ("requester", "courier"))
    ]
    result = Event(
        event_id=uuid4(),
        event_type="order.cancelled",
        occurred_at=datetime.now(timezone.utc),
        order_id=uuid4(),
        correlation_id=uuid4(),
        drafts=drafts,
    )

    assert store_event(short_lock_session_factory, result) is True
    assert lock_requests == sorted(COLLIDING_RECIPIENTS)
    assert counts(engine) == (1, 2)


def test_failed_transaction_releases_recipient_locks(
    engine, session_factory, lock_requests
) -> None:
    # Unstorable text in params fails the notifications insert, after the locks.
    result = parse(cancelled(ADMIN, "SECRET\u0000REASON", courier_id=BOB))

    with pytest.raises(DataError):
        store_event(session_factory, result)
    assert lock_requests == sorted([ALICE, BOB])

    with engine.connect() as connection, connection.begin():
        acquired = [
            connection.scalar(TRY_LOCK_SQL, lock_params(recipient))
            for recipient in (ALICE, BOB)
        ]
    assert acquired == [True, True]
    assert counts(engine) == (0, 0)


def test_stop_while_waiting_on_a_recipient_lock_leaves_the_offset_uncommitted(
    engine, session_factory, hold_recipient_locks
) -> None:
    release = hold_recipient_locks(ALICE)
    stop = threading.Event()
    consumer = FakeConsumer([], stop)
    message = order_record("order.expired", offset=4)

    thread = threading.Thread(
        target=deliver, args=(session_factory, consumer, message), kwargs={"stop": stop}
    )
    thread.start()
    try:
        assert wait_for_advisory_waiters(engine, 1) == 1
        stop.set()
    finally:
        release()
        thread.join(timeout=WAIT_SECONDS)

    assert not thread.is_alive()
    assert counts(engine) == (1, 1)
    assert consumer.commit_modes == []
