# AI Assistance Disclosure:
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-08
# Scope: Writing implementation code — database-free tests for the notification hub, Last-Event-ID parsing, the listener connection string and payload handling, and the stream loop's wake-ups, heartbeats, lifetime, batching, and cleanup (ai-20261108-002).
# Author review: Keith confirmed on 2026-11-09: full pytest suite (.venv/bin/python -m pytest -rs), 918 passed and 5 skipped; manual SSE checks against the local Compose stack (ai-20261108-002).
# Details: notification-service/ai/usage-log.md; ai-20261108-002

"""Notification stream tests that need no database.

The stream's two queries are replaced with in-memory fakes, so the loop's
timing and wake-up logic can be checked exactly. tests/test_stream_postgres.py
covers the same behaviour end to end.
"""

import asyncio
import time
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app import worker
from app.listener import (
    NOTIFY_CHANNEL,
    NotificationHub,
    NotificationListener,
    listener_conninfo,
)
from app.routes import stream
from tests.api_support import ALICE_ID, BOB_ID


# --- Hub ----------------------------------------------------------------------


def test_wake_sets_only_that_recipients_streams() -> None:
    async def scenario() -> None:
        hub = NotificationHub()
        alice_1 = hub.subscribe(ALICE_ID)
        alice_2 = hub.subscribe(ALICE_ID)
        bob = hub.subscribe(BOB_ID)

        hub.wake(ALICE_ID)

        assert alice_1.wake.is_set() and alice_2.wake.is_set()
        assert not bob.wake.is_set()

    asyncio.run(scenario())


def test_wake_for_a_recipient_with_no_streams_does_nothing() -> None:
    async def scenario() -> None:
        hub = NotificationHub()
        bob = hub.subscribe(BOB_ID)

        hub.wake(uuid4())

        assert not bob.wake.is_set()
        assert hub.stream_count() == 1

    asyncio.run(scenario())


def test_wake_all_sets_every_stream() -> None:
    async def scenario() -> None:
        hub = NotificationHub()
        subscriptions = [hub.subscribe(ALICE_ID), hub.subscribe(BOB_ID)]

        hub.wake_all()

        assert all(s.wake.is_set() for s in subscriptions)

    asyncio.run(scenario())


def test_unsubscribe_removes_the_stream_and_empty_recipients() -> None:
    async def scenario() -> None:
        hub = NotificationHub()
        first = hub.subscribe(ALICE_ID)
        second = hub.subscribe(ALICE_ID)

        hub.unsubscribe(first)
        hub.wake(ALICE_ID)

        assert not first.wake.is_set()
        assert second.wake.is_set()
        assert hub.stream_count(ALICE_ID) == 1
        hub.unsubscribe(second)
        hub.unsubscribe(second)  # a second call is harmless
        assert hub.stream_count() == 0
        assert hub._streams == {}

    asyncio.run(scenario())


# --- Listener -----------------------------------------------------------------


def test_listener_uses_the_worker_channel() -> None:
    assert NOTIFY_CHANNEL == worker.NOTIFY_CHANNEL


def test_listener_conninfo_drops_the_sqlalchemy_driver() -> None:
    conninfo = listener_conninfo("postgresql+psycopg://user:pw@db:5432/foc")

    assert conninfo == "postgresql://user:pw@db:5432/foc"


def test_listener_conninfo_without_password() -> None:
    conninfo = listener_conninfo("postgresql+psycopg://foc_notifications@db:5432/foc")

    assert conninfo == "postgresql://foc_notifications@db:5432/foc"


@pytest.mark.parametrize("payload", ["", "not-a-uuid", "1", f"{ALICE_ID} x"])
def test_listener_ignores_payloads_that_are_not_uuids(payload, caplog) -> None:
    async def scenario() -> None:
        hub = NotificationHub()
        alice = hub.subscribe(ALICE_ID)
        listener = NotificationListener(hub, "postgresql+psycopg://u@h/db")

        listener._dispatch(payload)

        assert not alice.wake.is_set()

    asyncio.run(scenario())
    assert any(
        getattr(record, "event", None) == "notification_wakeup_invalid"
        and record.fields["reason"] == "payload_not_uuid"
        for record in caplog.records
    )


def test_listener_wakes_the_recipient_in_the_payload() -> None:
    async def scenario() -> None:
        hub = NotificationHub()
        alice = hub.subscribe(ALICE_ID)
        bob = hub.subscribe(BOB_ID)
        listener = NotificationListener(hub, "postgresql+psycopg://u@h/db")

        listener._dispatch(str(ALICE_ID))

        assert alice.wake.is_set()
        assert not bob.wake.is_set()

    asyncio.run(scenario())


# --- Last-Event-ID ------------------------------------------------------------


@pytest.mark.parametrize(
    ("header", "expected"),
    [
        (None, None),
        ("", None),
        ("   ", None),
        ("abc", None),
        ("1.5", None),
        ("1e3", None),
        ("-1", None),
        ("-0", None),
        ("+5", None),
        ("0x10", None),
        ("1_000", None),
        ("١٢", None),  # Arabic-Indic digits, which int() accepts
        ("0", 0),
        ("7", 7),
        (" 42 ", 42),
        ("007", 7),
        (str(2**70), 2**70),
    ],
)
def test_parse_last_event_id(header, expected) -> None:
    assert stream.parse_last_event_id(header) == expected


# --- Stream loop with fake queries --------------------------------------------


class FakeRows:
    """In-memory stand-in for the notifications table, for one recipient."""

    def __init__(self, ids: list[int] | None = None) -> None:
        self.ids = list(ids or [])
        self.queries: list[int] = []
        self.on_query = None

    def newest_id(self, session_factory, recipient_id) -> int:
        return max(self.ids, default=0)

    def rows_after(self, session_factory, recipient_id, after_id, limit):
        self.queries.append(after_id)
        if self.on_query is not None:
            self.on_query()
        return [SimpleNamespace(id=i) for i in sorted(self.ids) if i > after_id][:limit]


@pytest.fixture
def rows(monkeypatch) -> FakeRows:
    fake = FakeRows()
    monkeypatch.setattr(stream, "newest_id", fake.newest_id)
    monkeypatch.setattr(stream, "rows_after", fake.rows_after)
    monkeypatch.setattr(stream, "format_event", lambda row: b"id: %d\n\n" % row.id)
    return fake


async def _open(hub, last_event_id=None, *, heartbeat=10.0, lifetime=10.0):
    subscription, last_sent_id = await stream.open_subscription(
        hub, None, ALICE_ID, last_event_id
    )
    events = stream.notification_events(
        subscription,
        None,
        last_sent_id,
        heartbeat_seconds=heartbeat,
        lifetime_seconds=lifetime,
    )
    return subscription, events


async def _next(events, timeout: float = 1.0) -> bytes:
    return await asyncio.wait_for(events.__anext__(), timeout)


def test_without_header_only_new_rows_are_sent(rows) -> None:
    rows.ids = [1, 2, 3]

    async def scenario() -> None:
        hub = NotificationHub()
        _, events = await _open(hub)
        pending = asyncio.ensure_future(_next(events))
        await asyncio.sleep(0.05)
        assert not pending.done()

        rows.ids.append(4)
        hub.wake(ALICE_ID)

        assert await pending == b"id: 4\n\n"
        await events.aclose()

    asyncio.run(scenario())


def test_header_sends_missed_rows_then_live_rows(rows) -> None:
    rows.ids = [1, 2, 3, 4]

    async def scenario() -> None:
        hub = NotificationHub()
        _, events = await _open(hub, last_event_id=2)

        assert await _next(events) == b"id: 3\n\n"
        assert await _next(events) == b"id: 4\n\n"
        rows.ids.append(9)
        hub.wake(ALICE_ID)
        assert await _next(events) == b"id: 9\n\n"
        await events.aclose()

    asyncio.run(scenario())


def test_header_above_the_newest_row_is_clamped(rows) -> None:
    rows.ids = [1, 2]

    async def scenario() -> None:
        hub = NotificationHub()
        _, events = await _open(hub, last_event_id=2**70)
        pending = asyncio.ensure_future(_next(events))
        await asyncio.sleep(0.05)
        assert not pending.done()

        rows.ids.append(3)
        hub.wake(ALICE_ID)

        assert await pending == b"id: 3\n\n"
        await events.aclose()

    asyncio.run(scenario())
    # The clamped value, never the header, reaches the query.
    assert max(rows.queries) <= 3


def test_header_zero_sends_the_whole_history(rows) -> None:
    rows.ids = [5, 6]

    async def scenario() -> None:
        _, events = await _open(NotificationHub(), last_event_id=0)
        assert [await _next(events), await _next(events)] == [
            b"id: 5\n\n",
            b"id: 6\n\n",
        ]
        await events.aclose()

    asyncio.run(scenario())


def test_subscribes_before_choosing_the_starting_point(rows, monkeypatch) -> None:
    hub = NotificationHub()

    def newest_id(session_factory, recipient_id) -> int:
        assert hub.stream_count(recipient_id) == 1
        return 0

    monkeypatch.setattr(stream, "newest_id", newest_id)

    async def scenario() -> None:
        subscription, last_sent_id = await stream.open_subscription(
            hub, None, ALICE_ID, None
        )
        assert last_sent_id == 0
        assert subscription.wake.is_set()

    asyncio.run(scenario())


def test_failed_starting_point_query_unsubscribes(monkeypatch) -> None:
    def broken(*args):
        raise RuntimeError("database down")

    monkeypatch.setattr(stream, "newest_id", broken)

    async def scenario() -> None:
        hub = NotificationHub()
        with pytest.raises(RuntimeError):
            await stream.open_subscription(hub, None, ALICE_ID, None)
        assert hub.stream_count() == 0

    asyncio.run(scenario())


def test_long_catch_up_is_sent_in_batches_in_order(rows, monkeypatch) -> None:
    monkeypatch.setattr(stream, "BATCH_SIZE", 3)
    rows.ids = list(range(1, 11))

    async def scenario() -> list[bytes]:
        _, events = await _open(NotificationHub(), last_event_id=0)
        received = [await _next(events) for _ in range(10)]
        await events.aclose()
        return received

    assert asyncio.run(scenario()) == [b"id: %d\n\n" % i for i in range(1, 11)]
    assert rows.queries[:4] == [0, 3, 6, 9]


def test_several_wake_ups_send_each_row_once(rows) -> None:
    async def scenario() -> None:
        hub = NotificationHub()
        _, events = await _open(hub)
        pending = asyncio.ensure_future(_next(events))
        await asyncio.sleep(0.05)

        rows.ids.extend([1, 2, 3])
        for _ in range(5):
            hub.wake(ALICE_ID)

        assert [await pending, await _next(events), await _next(events)] == [
            b"id: 1\n\n",
            b"id: 2\n\n",
            b"id: 3\n\n",
        ]
        rows.ids.append(4)
        hub.wake(ALICE_ID)
        assert await _next(events) == b"id: 4\n\n"
        await events.aclose()

    asyncio.run(scenario())


def test_wake_during_a_query_causes_another_query(rows) -> None:
    async def scenario() -> None:
        hub = NotificationHub()
        _, events = await _open(hub, last_event_id=0)
        rows.ids = [1]

        def commit_during_query() -> None:
            # Runs while the first query is in progress: a new row commits and
            # its NOTIFY arrives, but this query has already read the table.
            rows.on_query = None
            loop.call_soon_threadsafe(rows.ids.append, 2)
            loop.call_soon_threadsafe(hub.wake, ALICE_ID)
            time.sleep(0.05)

        loop = asyncio.get_running_loop()
        rows.on_query = commit_during_query
        assert await _next(events) == b"id: 1\n\n"
        assert await _next(events) == b"id: 2\n\n"
        await events.aclose()

    asyncio.run(scenario())


def test_heartbeat_is_sent_at_the_interval(rows) -> None:
    async def scenario() -> list[float]:
        _, events = await _open(NotificationHub(), heartbeat=0.1, lifetime=10)
        start = time.monotonic()
        times = []
        for _ in range(4):
            assert await _next(events) == b": ping\n\n"
            times.append(time.monotonic() - start)
        await events.aclose()
        return times

    times = asyncio.run(scenario())
    for index, elapsed in enumerate(times, start=1):
        assert elapsed == pytest.approx(0.1 * index, abs=0.05)


def test_heartbeats_continue_on_schedule_between_notifications(rows) -> None:
    async def scenario() -> list[tuple[float, bytes]]:
        hub = NotificationHub()
        _, events = await _open(hub, heartbeat=0.2, lifetime=10)
        start = time.monotonic()
        asyncio.get_running_loop().call_later(
            0.3, lambda: (rows.ids.append(1), hub.wake(ALICE_ID))
        )
        received = []
        for _ in range(3):
            chunk = await _next(events)
            received.append((round(time.monotonic() - start, 1), chunk))
        await events.aclose()
        return received

    assert asyncio.run(scenario()) == [
        (0.2, b": ping\n\n"),
        (0.3, b"id: 1\n\n"),
        (0.4, b": ping\n\n"),
    ]


def test_events_end_at_the_lifetime(rows) -> None:
    async def scenario() -> tuple[list[bytes], float]:
        start = time.monotonic()
        _, events = await _open(NotificationHub(), heartbeat=0.15, lifetime=0.5)

        async def collect() -> list[bytes]:
            return [chunk async for chunk in events]

        received = await asyncio.wait_for(collect(), timeout=2)
        return received, time.monotonic() - start

    received, elapsed = asyncio.run(scenario())
    assert received == [b": ping\n\n"] * 3
    assert elapsed == pytest.approx(0.5, abs=0.1)


def test_query_failure_ends_the_events(rows, monkeypatch, caplog) -> None:
    def broken(*args):
        raise RuntimeError("database down")

    monkeypatch.setattr(stream, "rows_after", broken)

    async def scenario() -> list[bytes]:
        _, events = await _open(NotificationHub(), last_event_id=0)

        async def collect() -> list[bytes]:
            return [chunk async for chunk in events]

        return await asyncio.wait_for(collect(), timeout=2)

    assert asyncio.run(scenario()) == []
    assert any(
        getattr(record, "event", None) == "notification_stream_failed"
        and record.fields["exception_type"] == "RuntimeError"
        for record in caplog.records
    )


# --- The response, driven as an ASGI app ----------------------------------------


SCOPE = {"type": "http", "asgi": {"version": "3.0", "spec_version": "2.3"}}


def _response(hub, *, heartbeat=10.0, lifetime=10.0, last_event_id=None):
    return stream.NotificationStreamResponse(
        hub,
        None,
        ALICE_ID,
        last_event_id,
        heartbeat_seconds=heartbeat,
        lifetime_seconds=lifetime,
    )


class FakeClient:
    """ASGI receive/send that records messages and can disconnect."""

    def __init__(self) -> None:
        self.sent: list[dict] = []
        self.disconnect = asyncio.Event()

    async def receive(self) -> dict:
        await self.disconnect.wait()
        return {"type": "http.disconnect"}

    async def send(self, message: dict) -> None:
        self.sent.append(message)

    def body(self) -> bytes:
        return b"".join(m.get("body", b"") for m in self.sent if m["type"] == "http.response.body")


def test_response_headers_are_sent_after_subscribing(rows, monkeypatch) -> None:
    async def scenario() -> None:
        hub = NotificationHub()
        client = FakeClient()

        async def send(message: dict) -> None:
            if message["type"] == "http.response.start":
                assert hub.stream_count(ALICE_ID) == 1
                assert dict(message["headers"])[b"content-type"] == b"text/event-stream"
            await client.send(message)

        await _response(hub, lifetime=0.05)(SCOPE, client.receive, send)
        assert client.sent[0]["type"] == "http.response.start"

    asyncio.run(scenario())


def test_response_ends_at_the_lifetime_and_unsubscribes(rows) -> None:
    async def scenario() -> None:
        hub = NotificationHub()
        client = FakeClient()
        rows.ids = [1]

        await asyncio.wait_for(
            _response(hub, heartbeat=0.1, lifetime=0.35, last_event_id=0)(
                SCOPE, client.receive, client.send
            ),
            timeout=2,
        )

        assert client.body() == b"id: 1\n\n" + b": ping\n\n" * 3
        assert client.sent[-1] == {
            "type": "http.response.body", "body": b"", "more_body": False
        }
        assert hub.stream_count() == 0

    asyncio.run(scenario())


def test_client_disconnect_unsubscribes(rows) -> None:
    async def scenario() -> None:
        hub = NotificationHub()
        client = FakeClient()
        task = asyncio.ensure_future(_response(hub)(SCOPE, client.receive, client.send))
        await asyncio.sleep(0.05)
        assert hub.stream_count(ALICE_ID) == 1

        client.disconnect.set()
        await asyncio.wait_for(task, timeout=1)

        assert hub.stream_count() == 0
        rows.ids.append(1)
        hub.wake(ALICE_ID)  # nothing is woken
        await asyncio.sleep(0.05)
        assert b"id:" not in client.body()

    asyncio.run(scenario())


def test_cancelled_response_unsubscribes(rows) -> None:
    async def scenario() -> None:
        hub = NotificationHub()
        client = FakeClient()
        task = asyncio.ensure_future(_response(hub)(SCOPE, client.receive, client.send))
        await asyncio.sleep(0.05)

        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

        assert hub.stream_count() == 0

    asyncio.run(scenario())


def test_failed_send_of_the_headers_unsubscribes(rows) -> None:
    async def scenario() -> None:
        hub = NotificationHub()
        client = FakeClient()

        async def send(message: dict) -> None:
            raise OSError("connection reset")

        # Starlette's task group wraps the error in an ExceptionGroup.
        with pytest.raises(ExceptionGroup) as raised:
            await _response(hub)(SCOPE, client.receive, send)
        assert raised.group_contains(OSError)
        assert hub.stream_count() == 0

    asyncio.run(scenario())


def test_failed_starting_point_query_sends_nothing(monkeypatch) -> None:
    def broken(*args):
        raise RuntimeError("database down")

    monkeypatch.setattr(stream, "newest_id", broken)

    async def scenario() -> None:
        hub = NotificationHub()
        client = FakeClient()
        with pytest.raises(RuntimeError):
            await _response(hub)(SCOPE, client.receive, client.send)
        # Nothing was sent, so the server can still answer with an error.
        assert client.sent == []
        assert hub.stream_count() == 0

    asyncio.run(scenario())
