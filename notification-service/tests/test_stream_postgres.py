# AI Assistance Disclosure:
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-08
# Scope: Writing implementation code — end-to-end stream tests against real PostgreSQL and a real uvicorn server: live delivery through the worker's NOTIFY, resume, Last-Event-ID edge cases, heartbeat, lifetime, isolation, several tabs, bursts, connect races, LISTEN reconnection, one LISTEN connection, auth failures, and disconnect cleanup (ai-20261108-002).
# Author review: Keith confirmed on 2026-11-09: full pytest suite (.venv/bin/python -m pytest -rs), 918 passed and 5 skipped; manual SSE checks against the local Compose stack (ai-20261108-002).
# Details: notification-service/ai/usage-log.md; ai-20261108-002

"""Live notification stream tests against real PostgreSQL.

Set TEST_DATABASE_URL (postgresql+psycopg://...) to a disposable database, as
for tests/test_schema.py. These tests migrate it and delete every row in
``notifications`` and ``processed_events``.

The app runs in a real uvicorn server on a background thread, because
Starlette's TestClient buffers the whole response and cannot show a stream
as it arrives or a client disconnecting. Notifications are written with the
worker's own ``store_event``, so they produce the worker's real NOTIFY.
"""

import json
import os
import queue
import socket
import subprocess
import sys
import threading
import time
from collections.abc import Callable, Iterator
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID, uuid4

import httpx
import pytest
import uvicorn
from sqlalchemy import text

from app.db import make_engine, make_session_factory
from app.events import Event, NotificationDraft
from app.listener import LISTENER_APPLICATION_NAME
from app.main import create_app
from app.models import Notification
from app.routes import stream
from app.worker import store_event
from tests.api_support import (
    ALICE_ID,
    ALICE_TOKEN,
    BOB_ID,
    BOB_TOKEN,
    FakeUserClient,
    api_settings,
    auth,
)

SERVICE_ROOT = Path(__file__).resolve().parents[1]
TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not TEST_DATABASE_URL,
    reason="Set TEST_DATABASE_URL to run notification stream integration tests",
)

OCCURRED_AT = datetime(2026, 11, 8, 9, 30, tzinfo=timezone(timedelta(hours=8)))
WAIT = 5.0  # generous upper bound for anything expected to happen promptly


# --- Database -------------------------------------------------------------------


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
    with engine.begin() as connection:
        connection.execute(text("DELETE FROM notifications"))
        connection.execute(text("DELETE FROM processed_events"))
    yield
    with engine.begin() as connection:
        connection.execute(text("DELETE FROM notifications"))
        connection.execute(text("DELETE FROM processed_events"))


def _draft(recipient_id: UUID) -> NotificationDraft:
    return NotificationDraft(
        recipient_id=recipient_id,
        recipient_role="requester",
        type="order.accepted",
        params={},
        title="Order accepted",
        body="A courier accepted your order.",
    )


def publish(engine, *recipients: UUID) -> list[int]:
    """Store one event through the worker (rows + NOTIFY); return the new ids."""

    event = Event(
        uuid4(), "order.accepted", OCCURRED_AT, uuid4(), uuid4(),
        [_draft(recipient) for recipient in recipients],
    )
    assert store_event(make_session_factory(engine), event)
    with engine.connect() as connection:
        return list(
            connection.scalars(
                text("SELECT id FROM notifications WHERE event_id = :e ORDER BY id"),
                {"e": event.event_id},
            )
        )


def add_silently(engine, recipient_id: UUID) -> int:
    """Insert a row with no NOTIFY, as if its wake-up had been lost."""

    with make_session_factory(engine)() as db, db.begin():
        draft = _draft(recipient_id)
        row = Notification(
            recipient_id=recipient_id,
            recipient_role=draft.recipient_role,
            event_id=uuid4(),
            order_id=uuid4(),
            type=draft.type,
            params=draft.params,
            title=draft.title,
            body=draft.body,
            occurred_at=OCCURRED_AT,
        )
        db.add(row)
        db.flush()
        return row.id


def add_in_one_transaction(engine, recipient_id: UUID, count: int) -> list[int]:
    """Commit ``count`` rows for one recipient with a single NOTIFY."""

    ids = []
    with make_session_factory(engine)() as db, db.begin():
        for _ in range(count):
            row = Notification(
                recipient_id=recipient_id,
                recipient_role="requester",
                event_id=uuid4(),
                order_id=uuid4(),
                type="order.accepted",
                params={},
                title="Order accepted",
                body="A courier accepted your order.",
                occurred_at=OCCURRED_AT,
            )
            db.add(row)
            db.flush()
            ids.append(row.id)
        db.execute(text(f"NOTIFY notifications, '{recipient_id}'"))
    return ids


def listener_pids(engine) -> list[int]:
    with engine.connect() as connection:
        return list(
            connection.scalars(
                text(
                    "SELECT pid FROM pg_stat_activity "
                    "WHERE datname = current_database() AND application_name = :name"
                ),
                {"name": LISTENER_APPLICATION_NAME},
            )
        )


def wait_until(condition: Callable[[], bool], timeout: float = WAIT) -> None:
    deadline = time.monotonic() + timeout
    while not condition():
        if time.monotonic() > deadline:
            raise AssertionError("condition not met in time")
        time.sleep(0.01)


# --- Server ---------------------------------------------------------------------


class Server:
    def __init__(self, app, base_url: str, users: FakeUserClient) -> None:
        self.app = app
        self.base_url = base_url
        self.users = users

    @property
    def hub(self):
        return self.app.state.hub

    def open(self, token: str = ALICE_TOKEN, **headers: str) -> "SSEClient":
        return SSEClient(self.base_url, {**auth(token), **headers})


@pytest.fixture
def start_server(engine) -> Iterator[Callable[..., Server]]:
    started: list[tuple[uvicorn.Server, threading.Thread]] = []

    def start(heartbeat: float = 30.0, lifetime: float = 60.0) -> Server:
        assert TEST_DATABASE_URL is not None
        users = FakeUserClient()
        settings = replace(
            api_settings(TEST_DATABASE_URL),
            sse_heartbeat_seconds=heartbeat,
            sse_max_lifetime_seconds=lifetime,
        )
        app = create_app(settings, user_client=users)
        sock = socket.socket()
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
        config = uvicorn.Config(
            app,
            log_level="warning",
            lifespan="on",
            ws="none",
            timeout_graceful_shutdown=1,
        )
        server = uvicorn.Server(config)
        thread = threading.Thread(target=server.run, kwargs={"sockets": [sock]})
        thread.start()
        started.append((server, thread))
        wait_until(lambda: server.started)
        # Streams opened before the listener connects are caught up when it
        # does; waiting here keeps the timing tests about steady state.
        wait_until(lambda: app.state.listener.connected.is_set())
        return Server(app, f"http://127.0.0.1:{port}", users)

    yield start
    for server, thread in started:
        server.should_exit = True
        thread.join(timeout=10)
        assert not thread.is_alive()


@pytest.fixture
def server(start_server) -> Server:
    return start_server()


_END = object()


class SSEClient:
    """Read an event stream on a background thread, one block at a time."""

    def __init__(self, base_url: str, headers: dict[str, str]) -> None:
        self._client = httpx.Client(base_url=base_url, timeout=httpx.Timeout(WAIT, read=None))
        self._lines: queue.Queue = queue.Queue()
        request = self._client.build_request("GET", "/notifications/stream", headers=headers)
        self.response = self._client.send(request, stream=True)
        self.ended_cleanly = False
        self._thread = threading.Thread(target=self._read, daemon=True)
        if self.response.status_code == 200:
            self._thread.start()

    def _read(self) -> None:
        try:
            for line in self.response.iter_lines():
                self._lines.put(line)
            self.ended_cleanly = True
        except Exception as error:  # closed by the test, or a broken stream
            self._lines.put(error)
        self._lines.put(_END)

    def next_block(self, timeout: float = WAIT) -> list[str] | None:
        """Lines up to the next blank line, or None when the stream has ended."""

        block: list[str] = []
        deadline = time.monotonic() + timeout
        while True:
            item = self._lines.get(timeout=max(0.0, deadline - time.monotonic()))
            if item is _END:
                assert not block, f"stream ended mid-event: {block}"
                return None
            if isinstance(item, Exception):
                raise item
            if item == "":
                if block:
                    return block
                continue
            block.append(item)

    def next_notification(self, timeout: float = WAIT) -> tuple[int, dict]:
        """The next event, skipping heartbeats."""

        deadline = time.monotonic() + timeout
        while True:
            block = self.next_block(max(0.0, deadline - time.monotonic()))
            assert block is not None, "stream ended"
            if block == [": ping"]:
                continue
            assert len(block) == 2, block
            assert block[0].startswith("id: ") and block[1].startswith("data: "), block
            event_id = int(block[0].removeprefix("id: "))
            data = json.loads(block[1].removeprefix("data: "))
            assert data["id"] == event_id
            return event_id, data

    def ids(self, count: int, timeout: float = WAIT) -> list[int]:
        return [self.next_notification(timeout)[0] for _ in range(count)]

    def assert_no_notification(self, seconds: float) -> None:
        try:
            event = self.next_notification(timeout=seconds)
        except queue.Empty:
            return
        raise AssertionError(f"unexpected notification {event}")

    def close(self) -> None:
        self.response.close()
        self._client.close()
        if self._thread.is_alive():
            self._thread.join(timeout=WAIT)


@pytest.fixture
def streams() -> Iterator[list[SSEClient]]:
    opened: list[SSEClient] = []
    yield opened
    for client in opened:
        client.close()


def opened(streams: list[SSEClient], client: SSEClient, server: Server, user: UUID,
           count: int = 1) -> SSEClient:
    """Track ``client`` for cleanup and wait until its stream is subscribed."""

    streams.append(client)
    assert client.response.status_code == 200, client.response.read()
    wait_until(lambda: server.hub.stream_count(user) >= count)
    return client


# --- Protocol and live delivery -------------------------------------------------


def test_response_headers(server, streams) -> None:
    client = opened(streams, server.open(), server, ALICE_ID)

    headers = client.response.headers
    assert headers["content-type"] == "text/event-stream"
    assert headers["cache-control"] == "no-cache, no-transform"
    assert headers["x-accel-buffering"] == "no"


def test_live_notification_arrives_within_a_second(engine, server, streams) -> None:
    client = opened(streams, server.open(), server, ALICE_ID)

    committed = time.monotonic()
    [notification_id] = publish(engine, ALICE_ID)
    event_id, data = client.next_notification(timeout=1.0)
    elapsed = time.monotonic() - committed

    assert event_id == notification_id
    assert data["type"] == "order.accepted"
    assert elapsed < 1.0


def test_event_data_is_the_history_dto(engine, server, streams) -> None:
    client = opened(streams, server.open(), server, ALICE_ID)
    publish(engine, ALICE_ID)

    _, data = client.next_notification()
    history = httpx.get(
        f"{server.base_url}/notifications", headers=auth(ALICE_TOKEN)
    ).json()["items"]

    assert history == [data]


def test_event_wire_format(engine, server, streams) -> None:
    client = opened(streams, server.open(), server, ALICE_ID)
    [notification_id] = publish(engine, ALICE_ID)

    block = client.next_block()

    assert block is not None and len(block) == 2
    assert block[0] == f"id: {notification_id}"
    assert block[1].startswith("data: {") and "\n" not in block[1]


def test_without_header_existing_notifications_are_not_sent(engine, server, streams) -> None:
    add_silently(engine, ALICE_ID)
    publish(engine, ALICE_ID)
    client = opened(streams, server.open(), server, ALICE_ID)

    [new_id] = publish(engine, ALICE_ID)

    assert client.ids(1) == [new_id]


def test_user_with_no_notifications_receives_new_ones(engine, server, streams) -> None:
    client = opened(streams, server.open(), server, ALICE_ID)

    first = publish(engine, ALICE_ID)
    second = publish(engine, ALICE_ID)

    assert client.ids(2) == first + second


# --- Resume with Last-Event-ID --------------------------------------------------


def test_resume_sends_missed_notifications_in_order_then_live(engine, server, streams) -> None:
    alice_ids = []
    for _ in range(5):
        alice_ids.append(add_silently(engine, ALICE_ID))
        add_silently(engine, BOB_ID)

    client = opened(
        streams, server.open(**{"Last-Event-ID": str(alice_ids[1])}), server, ALICE_ID
    )
    [live_id] = publish(engine, ALICE_ID)

    assert client.ids(4) == alice_ids[2:] + [live_id]
    [sentinel] = publish(engine, ALICE_ID)
    assert client.ids(1) == [sentinel]


def test_reconnect_after_missing_notifications(engine, server, streams) -> None:
    first = opened(streams, server.open(), server, ALICE_ID)
    publish(engine, ALICE_ID)
    received = first.ids(1)
    first.close()
    wait_until(lambda: server.hub.stream_count(ALICE_ID) == 0)

    missed = [publish(engine, ALICE_ID)[0] for _ in range(3)]
    publish(engine, BOB_ID)
    second = opened(
        streams, server.open(**{"Last-Event-ID": str(received[-1])}), server, ALICE_ID
    )
    [live_id] = publish(engine, ALICE_ID)

    assert second.ids(4) == missed + [live_id]
    second.assert_no_notification(0.3)


def test_last_event_id_zero_sends_the_whole_history(engine, server, streams) -> None:
    alice_ids = [add_silently(engine, ALICE_ID) for _ in range(3)]

    client = opened(streams, server.open(**{"Last-Event-ID": "0"}), server, ALICE_ID)

    assert client.ids(3) == alice_ids


# Whitespace-only values are covered in tests/test_stream.py; httpx refuses
# to send them.
@pytest.mark.parametrize("header", ["abc", "-1", "-0", "1.5", "", "1e3", "12abc"])
def test_invalid_last_event_id_sends_only_new_notifications(
    engine, server, streams, header
) -> None:
    add_silently(engine, ALICE_ID)
    add_silently(engine, ALICE_ID)

    client = opened(streams, server.open(**{"Last-Event-ID": header}), server, ALICE_ID)
    [new_id] = publish(engine, ALICE_ID)

    assert client.ids(1) == [new_id]


@pytest.mark.parametrize("offset", [1, 1000, 2**63, 2**80])
def test_last_event_id_above_every_id_still_receives_new_notifications(
    engine, server, streams, offset
) -> None:
    newest = add_silently(engine, ALICE_ID)

    client = opened(
        streams, server.open(**{"Last-Event-ID": str(newest + offset)}), server, ALICE_ID
    )
    [new_id] = publish(engine, ALICE_ID)

    assert client.ids(1) == [new_id]


def test_last_event_id_above_callers_newest_but_below_others(engine, server, streams) -> None:
    alice_newest = add_silently(engine, ALICE_ID)
    bob_newest = add_silently(engine, BOB_ID)

    client = opened(
        streams, server.open(**{"Last-Event-ID": str(bob_newest)}), server, ALICE_ID
    )
    client.assert_no_notification(0.3)
    [new_id] = publish(engine, ALICE_ID)

    assert alice_newest < bob_newest < new_id
    assert client.ids(1) == [new_id]


# --- Heartbeat and lifetime -----------------------------------------------------


def test_heartbeat_at_the_configured_interval(start_server, streams) -> None:
    server = start_server(heartbeat=0.3, lifetime=60)
    client = opened(streams, server.open(), server, ALICE_ID)
    start = time.monotonic()

    times = []
    for _ in range(4):
        assert client.next_block() == [": ping"]
        times.append(time.monotonic() - start)

    for index, elapsed in enumerate(times, start=1):
        assert elapsed == pytest.approx(0.3 * index, abs=0.15)


def test_stream_closes_cleanly_after_the_lifetime(start_server, streams) -> None:
    server = start_server(heartbeat=30, lifetime=1.0)
    start = time.monotonic()
    client = opened(streams, server.open(), server, ALICE_ID)

    assert client.next_block(timeout=WAIT) is None
    elapsed = time.monotonic() - start

    assert elapsed == pytest.approx(1.0, abs=0.4)
    assert client.ended_cleanly
    wait_until(lambda: server.hub.stream_count() == 0)


def test_notifications_still_arrive_before_the_lifetime_ends(engine, start_server, streams) -> None:
    server = start_server(heartbeat=0.2, lifetime=1.5)
    client = opened(streams, server.open(), server, ALICE_ID)

    [new_id] = publish(engine, ALICE_ID)

    assert client.ids(1) == [new_id]
    while client.next_block() is not None:
        pass
    assert client.ended_cleanly


# --- Isolation and several streams ----------------------------------------------


def test_each_user_only_receives_their_own_notifications(engine, server, streams) -> None:
    alice = opened(streams, server.open(ALICE_TOKEN), server, ALICE_ID)
    bob = opened(streams, server.open(BOB_TOKEN), server, BOB_ID)

    alice_ids, bob_ids = [], []
    for _ in range(3):
        alice_ids += publish(engine, ALICE_ID)
        bob_ids += publish(engine, BOB_ID)
    shared = publish(engine, ALICE_ID, BOB_ID)  # one event, both recipients

    alice_received = [alice.next_notification() for _ in range(4)]
    bob_received = [bob.next_notification() for _ in range(4)]

    assert [i for i, _ in alice_received] == alice_ids + [shared[0]]
    assert [i for i, _ in bob_received] == bob_ids + [shared[1]]
    alice.assert_no_notification(0.3)
    bob.assert_no_notification(0.1)


def test_resume_never_includes_other_users_rows(engine, server, streams) -> None:
    bob_ids = [add_silently(engine, BOB_ID) for _ in range(3)]
    alice_id = add_silently(engine, ALICE_ID)

    client = opened(streams, server.open(**{"Last-Event-ID": "0"}), server, ALICE_ID)

    assert client.ids(1) == [alice_id]
    client.assert_no_notification(0.3)
    assert alice_id not in bob_ids


def test_every_open_stream_of_a_user_receives_every_notification(engine, server, streams) -> None:
    tabs = [server.open() for _ in range(3)]
    for index, tab in enumerate(tabs, start=1):
        opened(streams, tab, server, ALICE_ID, count=index)

    published = [publish(engine, ALICE_ID)[0] for _ in range(5)]

    for tab in tabs:
        assert tab.ids(5) == published


# --- Bursts and races -----------------------------------------------------------


def test_burst_of_commits_is_sent_once_in_order(engine, server, streams) -> None:
    client = opened(streams, server.open(), server, ALICE_ID)

    published = []
    for _ in range(30):
        published += publish(engine, ALICE_ID)
    published += add_in_one_transaction(engine, ALICE_ID, 3)  # one NOTIFY, three rows
    published += publish(engine, ALICE_ID, BOB_ID)[:1]

    assert client.ids(len(published)) == published
    [sentinel] = publish(engine, ALICE_ID)
    assert client.ids(1) == [sentinel]


def test_several_notifies_at_once_send_each_row_once(engine, server, streams) -> None:
    client = opened(streams, server.open(), server, ALICE_ID)
    ids = [add_silently(engine, ALICE_ID) for _ in range(3)]

    # PostgreSQL folds identical NOTIFYs within one transaction, so these are
    # separate transactions, plus a second spelling of the same UUID.
    for payload in [str(ALICE_ID)] * 5 + [str(ALICE_ID).upper()]:
        with engine.begin() as connection:
            connection.execute(text(f"NOTIFY notifications, '{payload}'"))

    assert client.ids(3) == ids
    [sentinel] = publish(engine, ALICE_ID)
    assert client.ids(1) == [sentinel]


def test_notify_for_a_recipient_with_no_streams_does_nothing(engine, server, streams) -> None:
    bob = opened(streams, server.open(BOB_TOKEN), server, BOB_ID)

    publish(engine, ALICE_ID)
    publish(engine, uuid4())
    with engine.begin() as connection:
        connection.execute(text("NOTIFY notifications, 'not-a-uuid'"))

    bob.assert_no_notification(0.3)
    assert server.hub.stream_count(ALICE_ID) == 0
    assert server.hub.stream_count() == 1
    [bob_id] = publish(engine, BOB_ID)
    assert bob.ids(1) == [bob_id]


def _patch_first_call(monkeypatch, name: str, *, before: Callable[[], object] | None = None,
                      after: Callable[[], object] | None = None) -> None:
    original = getattr(stream, name)
    calls = []

    def patched(*args):
        first = not calls
        calls.append(args)
        if first and before:
            before()
        result = original(*args)
        if first and after:
            after()
        return result

    monkeypatch.setattr(stream, name, patched)


def test_commit_right_after_the_catch_up_query_is_sent_once(
    engine, server, streams, monkeypatch
) -> None:
    missed = add_silently(engine, ALICE_ID)
    late: list[int] = []
    _patch_first_call(
        monkeypatch, "rows_after", after=lambda: late.extend(publish(engine, ALICE_ID))
    )

    client = opened(
        streams, server.open(**{"Last-Event-ID": str(missed - 1)}), server, ALICE_ID
    )

    assert client.ids(2) == [missed] + late
    [sentinel] = publish(engine, ALICE_ID)
    assert client.ids(1) == [sentinel]


def test_commit_during_the_catch_up_query_is_sent_once(
    engine, server, streams, monkeypatch
) -> None:
    missed = add_silently(engine, ALICE_ID)
    late: list[int] = []
    # Committed and notified before the query reads: the query returns it
    # and the NOTIFY wakes the stream again, which must not resend it.
    _patch_first_call(
        monkeypatch, "rows_after", before=lambda: late.extend(publish(engine, ALICE_ID))
    )

    client = opened(
        streams, server.open(**{"Last-Event-ID": str(missed - 1)}), server, ALICE_ID
    )

    assert client.ids(2) == [missed] + late
    [sentinel] = publish(engine, ALICE_ID)
    assert client.ids(1) == [sentinel]


def test_commit_right_after_the_newest_id_query_is_sent_once(
    engine, server, streams, monkeypatch
) -> None:
    add_silently(engine, ALICE_ID)
    late: list[int] = []
    _patch_first_call(
        monkeypatch, "newest_id", after=lambda: late.extend(publish(engine, ALICE_ID))
    )

    client = opened(streams, server.open(), server, ALICE_ID)

    assert client.ids(1) == late
    [sentinel] = publish(engine, ALICE_ID)
    assert client.ids(1) == [sentinel]


# --- The LISTEN connection ------------------------------------------------------


def test_one_listen_connection_however_many_streams(engine, server, streams) -> None:
    assert len(listener_pids(engine)) == 1

    for index in range(1, 6):
        opened(streams, server.open(), server, ALICE_ID, count=index)
    opened(streams, server.open(BOB_TOKEN), server, BOB_ID)

    assert len(listener_pids(engine)) == 1
    with engine.connect() as connection:
        listening = connection.scalar(
            text(
                "SELECT count(*) FROM pg_stat_activity "
                "WHERE datname = current_database() AND query ILIKE 'LISTEN%'"
            )
        )
    assert listening == 1


def test_listen_connection_drop_reconnects_and_catches_up(engine, server, streams) -> None:
    alice = opened(streams, server.open(ALICE_TOKEN), server, ALICE_ID)
    bob = opened(streams, server.open(BOB_TOKEN), server, BOB_ID)
    [old_pid] = listener_pids(engine)
    # Committed with no wake-up, as if its NOTIFY were lost during the outage.
    alice_missed = add_silently(engine, ALICE_ID)
    bob_missed = add_silently(engine, BOB_ID)

    with engine.connect() as connection:
        assert connection.scalar(text("SELECT pg_terminate_backend(:p)"), {"p": old_pid})

    assert alice.ids(1, timeout=WAIT) == [alice_missed]
    assert bob.ids(1, timeout=WAIT) == [bob_missed]
    new_pids = listener_pids(engine)
    assert len(new_pids) == 1 and new_pids != [old_pid]
    # Live delivery works again over the new connection, with no repeats.
    [live] = publish(engine, ALICE_ID)
    assert alice.ids(1, timeout=1.0) == [live]
    bob.assert_no_notification(0.3)


def test_notifications_committed_while_the_listener_is_down_are_delivered(
    engine, server, streams
) -> None:
    alice = opened(streams, server.open(), server, ALICE_ID)
    [old_pid] = listener_pids(engine)
    with engine.connect() as connection:
        connection.scalar(text("SELECT pg_terminate_backend(:p)"), {"p": old_pid})
    # Published around the reconnect: either its NOTIFY or the catch-up
    # after reconnecting delivers it, and never both.
    published = [publish(engine, ALICE_ID)[0] for _ in range(3)]

    wait_until(lambda: listener_pids(engine) not in ([], [old_pid]))
    assert alice.ids(3) == published
    [sentinel] = publish(engine, ALICE_ID)
    assert alice.ids(1) == [sentinel]


# --- Authentication -------------------------------------------------------------


def test_invalid_token_returns_401_and_opens_no_stream(server, streams) -> None:
    client = server.open("forged")
    streams.append(client)

    assert client.response.status_code == 401
    assert client.response.headers["www-authenticate"] == "Bearer"
    assert client.response.headers["content-type"].startswith("application/json")
    assert server.hub.stream_count() == 0


def test_missing_token_returns_401(server) -> None:
    response = httpx.get(f"{server.base_url}/notifications/stream")

    assert response.status_code == 401
    assert server.users.tokens_seen == []
    assert server.hub.stream_count() == 0


def test_user_service_outage_returns_503_and_opens_no_stream(server, streams) -> None:
    server.users.unavailable = True
    client = server.open()
    streams.append(client)

    assert client.response.status_code == 503
    assert client.response.headers["content-type"].startswith("application/json")
    assert server.hub.stream_count() == 0


def test_token_is_resolved_once_when_the_stream_opens(engine, start_server, streams) -> None:
    server = start_server(heartbeat=0.1, lifetime=60)
    client = opened(streams, server.open(), server, ALICE_ID)
    publish(engine, ALICE_ID)
    client.next_notification()
    for _ in range(3):
        client.next_block()

    assert server.users.tokens_seen == [ALICE_TOKEN]


# --- Disconnect -----------------------------------------------------------------


def test_disconnect_releases_the_stream(engine, server, streams) -> None:
    leaving = opened(streams, server.open(), server, ALICE_ID)
    staying = opened(streams, server.open(), server, ALICE_ID, count=2)

    leaving.close()

    wait_until(lambda: server.hub.stream_count(ALICE_ID) == 1, timeout=2.0)
    [new_id] = publish(engine, ALICE_ID)
    assert staying.ids(1) == [new_id]
    assert server.hub.stream_count(ALICE_ID) == 1


def test_last_disconnect_removes_the_recipient(engine, server, streams) -> None:
    client = opened(streams, server.open(), server, ALICE_ID)

    client.close()

    wait_until(lambda: server.hub.stream_count() == 0, timeout=2.0)
    assert server.hub._streams == {}
    publish(engine, ALICE_ID)  # a NOTIFY with nobody listening is harmless
    bob = opened(streams, server.open(BOB_TOKEN), server, BOB_ID)
    [bob_id] = publish(engine, BOB_ID)
    assert bob.ids(1) == [bob_id]


def test_disconnect_does_not_leak_database_connections(engine, server, streams) -> None:
    def api_connections() -> int:
        with engine.connect() as connection:
            return connection.scalar(
                text(
                    "SELECT count(*) FROM pg_stat_activity "
                    "WHERE datname = current_database() AND state = 'active' "
                    "AND backend_type = 'client backend' "
                    "AND pid <> pg_backend_pid() AND application_name <> :name"
                ),
                {"name": LISTENER_APPLICATION_NAME},
            )

    clients = [opened(streams, server.open(), server, ALICE_ID, count=i) for i in range(1, 11)]
    # Open streams hold no database connection while waiting.
    wait_until(lambda: api_connections() == 0, timeout=2.0)

    for client in clients:
        client.close()
    wait_until(lambda: server.hub.stream_count() == 0, timeout=2.0)
    wait_until(lambda: api_connections() == 0, timeout=2.0)
