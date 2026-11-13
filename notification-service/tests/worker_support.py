# AI Assistance Disclosure:
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-04
# Scope: Writing implementation code — write the Kafka test doubles and record builders shared by the worker tests (ai-20261104-003).
# Author review: Keith confirmed verification, with 551 tests passed on the Pytest suite (ai-20261104-003).
# Details: notification-service/ai/usage-log.md; ai-20261104-003
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-05
# Scope: Writing implementation code — add DLQ publisher and producer doubles, and backoff settings (ai-20261105-001).
# Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16 and Kafka 4.1.2, 645 passed; code manually read and verified; manual checks in an isolated Compose run (ai-20261105-001).
# Details: notification-service/ai/usage-log.md; ai-20261105-001

"""Kafka test doubles and record builders shared by the worker tests."""

import json
import threading
from collections.abc import Callable, Iterable
from datetime import datetime, timezone
from uuid import uuid4

from app.config import WorkerSettings

ALICE = "44444444-bbbb-4444-8444-444444444444"
BOB = "55555555-cccc-4555-8555-555555555555"
ADMIN = "66666666-dddd-4666-8666-666666666666"
START_AT = datetime(2026, 11, 4, 0, 0, tzinfo=timezone.utc)
AFTER = "2026-11-04T08:30:00+08:00"
BEFORE = "2026-11-03T08:30:00+08:00"


class FakeError:
    def __init__(self, fatal: bool, text: str = "broker trouble") -> None:
        self._fatal = fatal
        self._text = text

    def fatal(self) -> bool:
        return self._fatal

    def __str__(self) -> str:
        return self._text


class FakeMessage:
    def __init__(self, key, value, headers, *, offset=0, partition=0, error=None) -> None:
        self._key = key
        self._value = value
        self._headers = headers
        self._offset = offset
        self._partition = partition
        self._error = error

    def key(self):
        return self._key

    def value(self):
        return self._value

    def headers(self):
        return self._headers

    def topic(self):
        return "order.events"

    def partition(self):
        return self._partition

    def offset(self):
        return self._offset

    def error(self):
        return self._error


class FakeConsumer:
    """Replays scripted messages, then sets ``stop`` once they run out.

    ``on_commit`` runs inside each commit, so tests can look at the database as
    it was at that moment. ``commit_error`` makes commit raise instead.
    """

    def __init__(
        self,
        messages: Iterable[FakeMessage],
        stop: threading.Event,
        *,
        on_commit: Callable[[FakeMessage], None] | None = None,
        commit_error: Exception | None = None,
    ) -> None:
        self._messages = list(messages)
        self._stop = stop
        self._on_commit = on_commit
        self._commit_error = commit_error
        self.committed: list[int] = []
        self.commit_modes: list[bool] = []
        self.closed = False

    def poll(self, timeout: float):
        if self._messages:
            return self._messages.pop(0)
        self._stop.set()
        return None

    def commit(self, *, message, asynchronous):
        self.commit_modes.append(asynchronous)
        if self._commit_error is not None:
            raise self._commit_error
        if self._on_commit is not None:
            self._on_commit(message)
        self.committed.append(message.offset())

    def close(self) -> None:
        self.closed = True


class FakePublisher:
    """Records dead-letter calls. ``error`` makes the publish raise instead."""

    def __init__(self, *, error: Exception | None = None, on_publish=None) -> None:
        self._error = error
        self._on_publish = on_publish
        self.published: list[tuple[int, str, int]] = []

    def dead_letter(self, message, *, failure_code, attempts) -> None:
        if self._error is not None:
            raise self._error
        if self._on_publish is not None:
            self._on_publish(message)
        self.published.append((message.offset(), failure_code, attempts))


class FakeProducer:
    """Runs delivery callbacks inside ``flush``, as librdkafka does."""

    def __init__(
        self, *, delivery_error=None, remaining: int = 0, deliver: bool = True, log=None
    ) -> None:
        self._delivery_error = delivery_error
        self._remaining = remaining
        self._deliver = deliver
        self._log = log if log is not None else []
        self.records: list[dict] = []
        self.flush_timeouts: list[float] = []

    def produce(self, *, on_delivery, **record) -> None:
        self._log.append("produce")
        self.records.append(record)
        self._on_delivery = on_delivery

    def flush(self, timeout: float) -> int:
        self._log.append("flush")
        self.flush_timeouts.append(timeout)
        if self._deliver:
            self._on_delivery(self._delivery_error, None)
        return self._remaining


def make_settings(
    database_url: str, retry_backoff_seconds: tuple[float, ...] = ()
) -> WorkerSettings:
    return WorkerSettings(
        database_url=database_url,
        kafka_bootstrap_servers="unused:9092",
        notifications_start_at=START_AT,
        retry_backoff_seconds=retry_backoff_seconds,
    )


def order_record(
    event_type: str,
    *,
    order_id: str | None = None,
    event_id: str | None = None,
    correlation_id: str | None = None,
    occurred_at: str = AFTER,
    offset: int = 0,
    **payload_fields,
) -> FakeMessage:
    """Build a valid record. ``payload_fields`` add to order_id and requester_id."""

    order_id = order_id or str(uuid4())
    event_id = event_id or str(uuid4())
    payload = {"order_id": order_id, "requester_id": ALICE, **payload_fields}
    envelope = {
        "event_id": event_id,
        "event_type": event_type,
        "schema_version": 1,
        "occurred_at": occurred_at,
        "correlation_id": correlation_id or str(uuid4()),
        "payload": payload,
    }
    return FakeMessage(
        order_id.encode(),
        json.dumps(envelope).encode(),
        [("event_type", event_type.encode()), ("event_id", event_id.encode())],
        offset=offset,
    )
