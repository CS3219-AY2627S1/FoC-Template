# AI Assistance Disclosure:
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-08
# Scope: Writing implementation code — PostgreSQL tests for scoping, pagination, read status, read-all, 404 isolation, concurrent reads, edge cases, and EXPLAIN plans (ai-20261108-001).
# Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16, 790 passed and 5 real-broker tests skipped; code read and verified; manual checks against the full Compose stack with the real User Service (ai-20261108-001).
# Details: notification-service/ai/usage-log.md; ai-20261108-001

"""Notification API tests against real PostgreSQL, with a User Service double.

Set TEST_DATABASE_URL (postgresql+psycopg://...) to a disposable database, as
for tests/test_schema.py. These tests migrate it and delete every row in
``notifications`` and ``processed_events``.
"""

import os
import subprocess
import sys
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, text

from app.db import make_engine, make_session_factory
from app.events import Event, _translate
from app.main import create_app
from app.models import Notification
from app.worker import store_event
from tests.api_support import (
    ALICE_ID,
    ALICE_TOKEN,
    BOB_ID,
    BOB_TOKEN,
    EMPTY_TOKEN,
    FakeUserClient,
    api_settings,
    auth,
)

SERVICE_ROOT = Path(__file__).resolve().parents[1]
TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not TEST_DATABASE_URL,
    reason="Set TEST_DATABASE_URL to run notification API integration tests",
)

OCCURRED_AT = datetime(2026, 11, 8, 9, 30, tzinfo=timezone(timedelta(hours=8)))


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


@pytest.fixture
def users() -> FakeUserClient:
    return FakeUserClient()


@pytest.fixture
def client(engine, users):
    assert TEST_DATABASE_URL is not None
    app = create_app(api_settings(TEST_DATABASE_URL), user_client=users)
    with TestClient(app) as test_client:
        yield test_client


def add(
    engine,
    recipient_id: UUID,
    *,
    type_: str = "order.accepted",
    params: dict[str, Any] | None = None,
    read_at: datetime | None = None,
) -> int:
    with make_session_factory(engine)() as db, db.begin():
        row = Notification(
            recipient_id=recipient_id,
            recipient_role="requester",
            event_id=uuid4(),
            order_id=uuid4(),
            type=type_,
            params={} if params is None else params,
            title="Order accepted",
            body="A courier accepted your order.",
            occurred_at=OCCURRED_AT,
            read_at=read_at,
        )
        db.add(row)
        db.flush()
        return row.id


def add_interleaved(engine, alice: int, bob: int) -> list[int]:
    """Add rows for Alice and Bob with interleaved ids; return Alice's, newest first."""

    alice_ids = []
    for index in range(max(alice, bob)):
        if index < alice:
            alice_ids.append(add(engine, ALICE_ID))
        if index < bob:
            add(engine, BOB_ID)
    return sorted(alice_ids, reverse=True)


def read_at_of(engine, notification_id: int) -> datetime | None:
    with engine.connect() as connection:
        return connection.scalar(
            text("SELECT read_at FROM notifications WHERE id = :id"),
            {"id": notification_id},
        )


def unread(client, token: str = ALICE_TOKEN) -> int:
    response = client.get("/notifications/unread-count", headers=auth(token))
    assert response.status_code == 200
    return response.json()["count"]


def all_pages(client, limit: int, token: str = ALICE_TOKEN) -> list[dict]:
    pages = []
    cursor = None
    while True:
        query = f"limit={limit}" + (f"&cursor={cursor}" if cursor is not None else "")
        response = client.get(f"/notifications?{query}", headers=auth(token))
        assert response.status_code == 200
        pages.append(response.json())
        cursor = pages[-1]["next_cursor"]
        if cursor is None:
            return pages
        assert len(pages) < 1000


# --- Listing and pagination -------------------------------------------------


def test_lists_only_the_callers_notifications_newest_first(engine, client) -> None:
    alice_ids = add_interleaved(engine, alice=3, bob=4)

    response = client.get("/notifications", headers=auth(ALICE_TOKEN))

    assert response.status_code == 200
    body = response.json()
    assert [item["id"] for item in body["items"]] == alice_ids
    assert body["next_cursor"] is None


def test_dto_fields_and_utc_timestamps(engine, client) -> None:
    read_at = datetime(2026, 11, 8, 12, 0, 5, 250000, tzinfo=timezone(timedelta(hours=-5)))
    notification_id = add(
        engine,
        ALICE_ID,
        type_="order.opened",
        params={"credit_amount": 3},
        read_at=read_at,
    )
    with engine.connect() as connection:
        order_id, created_at = connection.execute(
            text("SELECT order_id, created_at FROM notifications WHERE id = :id"),
            {"id": notification_id},
        ).one()

    item = client.get("/notifications", headers=auth(ALICE_TOKEN)).json()["items"][0]

    assert item == {
        "id": notification_id,
        "type": "order.opened",
        "recipient_role": "requester",
        "params": {"credit_amount": 3},
        "title": "Order accepted",
        "body": "A courier accepted your order.",
        "order_id": str(order_id),
        "occurred_at": "2026-11-08T01:30:00Z",
        "created_at": created_at.astimezone(timezone.utc)
        .isoformat()
        .replace("+00:00", "Z"),
        "read_at": "2026-11-08T17:00:05.250000Z",
    }
    assert "link" not in item


@pytest.mark.parametrize(
    ("count", "limit", "page_sizes"),
    [
        (7, 3, [3, 3, 1]),
        (6, 3, [3, 3]),
        (1, 1, [1]),
        (2, 1, [1, 1]),
        (100, 100, [100]),
        (101, 100, [100, 1]),
    ],
)
def test_following_next_cursor_has_no_overlaps_or_gaps(
    engine, client, count, limit, page_sizes
) -> None:
    alice_ids = add_interleaved(engine, alice=count, bob=count)

    pages = all_pages(client, limit)

    assert [len(page["items"]) for page in pages] == page_sizes
    seen = [item["id"] for page in pages for item in page["items"]]
    assert seen == alice_ids
    for page in pages[:-1]:
        assert page["next_cursor"] == page["items"][-1]["id"]
    assert pages[-1]["next_cursor"] is None


def test_limit_defaults_to_20(engine, client) -> None:
    alice_ids = add_interleaved(engine, alice=25, bob=0)

    body = client.get("/notifications", headers=auth(ALICE_TOKEN)).json()

    assert [item["id"] for item in body["items"]] == alice_ids[:20]
    assert body["next_cursor"] == alice_ids[19]


def test_cursor_returns_items_below_it(engine, client) -> None:
    alice_ids = add_interleaved(engine, alice=5, bob=5)
    cursor = alice_ids[1]

    body = client.get(
        f"/notifications?cursor={cursor}", headers=auth(ALICE_TOKEN)
    ).json()

    assert [item["id"] for item in body["items"]] == alice_ids[2:]


def test_user_with_no_notifications(engine, client) -> None:
    add_interleaved(engine, alice=2, bob=2)

    body = client.get("/notifications", headers=auth(EMPTY_TOKEN)).json()

    assert body == {"items": [], "next_cursor": None}
    assert unread(client, EMPTY_TOKEN) == 0


@pytest.mark.parametrize("cursor_offset", [1, 1000])
def test_cursor_beyond_the_newest_id_returns_the_newest_page(
    engine, client, cursor_offset
) -> None:
    alice_ids = add_interleaved(engine, alice=3, bob=3)
    cursor = max(alice_ids) + cursor_offset

    body = client.get(f"/notifications?cursor={cursor}", headers=auth(ALICE_TOKEN)).json()

    assert [item["id"] for item in body["items"]] == alice_ids


@pytest.mark.parametrize("cursor", [2**63 - 1, 2**63, 10**30])
def test_cursor_beyond_bigint_returns_the_newest_page(engine, client, cursor) -> None:
    alice_ids = add_interleaved(engine, alice=3, bob=3)

    body = client.get(f"/notifications?cursor={cursor}", headers=auth(ALICE_TOKEN)).json()

    assert [item["id"] for item in body["items"]] == alice_ids


@pytest.mark.parametrize("cursor", [0, -1, -(2**63), -(10**30)])
def test_cursor_zero_or_below_returns_an_empty_page(engine, client, cursor) -> None:
    add_interleaved(engine, alice=3, bob=3)

    response = client.get(f"/notifications?cursor={cursor}", headers=auth(ALICE_TOKEN))

    assert response.status_code == 200
    assert response.json() == {"items": [], "next_cursor": None}


def test_user_id_is_never_taken_from_the_request(engine, client) -> None:
    alice_ids = add_interleaved(engine, alice=2, bob=2)

    response = client.get(
        f"/notifications?recipient_id={BOB_ID}&user_id={BOB_ID}",
        headers=auth(ALICE_TOKEN),
    )

    assert [item["id"] for item in response.json()["items"]] == alice_ids


@pytest.mark.parametrize("scheme", ["Bearer", "bearer", "BEARER", "bEaReR"])
def test_scheme_name_is_case_insensitive(engine, client, users, scheme) -> None:
    alice_ids = add_interleaved(engine, alice=1, bob=1)

    response = client.get(
        "/notifications", headers={"Authorization": f"{scheme} {ALICE_TOKEN}"}
    )

    assert response.status_code == 200
    assert [item["id"] for item in response.json()["items"]] == alice_ids
    assert users.tokens_seen == [ALICE_TOKEN]


def test_every_type_from_the_worker_is_served_with_its_params(engine, client) -> None:
    """Rows written by the worker's own translation validate against the DTO."""

    courier = uuid4()
    requester = {"requester_id": str(ALICE_ID)}
    payloads = [
        ("order.opened", {**requester, "credit_amount": 2}),
        ("order.rejected", {**requester, "reason": None}),
        ("order.rejected", {**requester, "reason": "insufficient credit"}),
        ("order.accepted", {**requester, "courier_id": str(courier)}),
        ("order.picked_up", {**requester, "courier_id": str(courier)}),
        (
            "order.completed",
            {"requester_id": str(uuid4()), "courier_id": str(ALICE_ID), "credit_amount": 5},
        ),
        ("order.expired", requester),
        (
            "order.cancelled",
            {**requester, "cancelled_by": str(uuid4()), "previous_status": "accepted"},
        ),
    ]
    for event_type, payload in payloads:
        drafts = _translate(event_type, payload)
        store_event(
            make_session_factory(engine),
            Event(uuid4(), event_type, OCCURRED_AT, uuid4(), uuid4(), drafts),
        )

    items = client.get("/notifications", headers=auth(ALICE_TOKEN)).json()["items"]

    assert [(item["type"], item["recipient_role"], item["params"]) for item in reversed(items)] == [
        ("order.opened", "requester", {"credit_amount": 2}),
        ("order.rejected", "requester", {"reason": None}),
        ("order.rejected", "requester", {"reason": "insufficient credit"}),
        ("order.accepted", "requester", {}),
        ("order.picked_up", "requester", {}),
        ("order.completed", "courier", {"credit_amount": 5}),
        ("order.expired", "requester", {}),
        (
            "order.cancelled",
            "requester",
            {"cancelled_by_role": "admin", "previous_status": "accepted"},
        ),
    ]
    assert all(item["occurred_at"] == "2026-11-08T01:30:00Z" for item in items)


# --- Read status ------------------------------------------------------------


def test_marking_read_decreases_unread_count_once(engine, client) -> None:
    alice_ids = add_interleaved(engine, alice=3, bob=2)
    target = alice_ids[1]
    assert unread(client) == 3
    assert unread(client, BOB_TOKEN) == 2

    first = client.post(f"/notifications/{target}/read", headers=auth(ALICE_TOKEN))

    assert first.status_code == 200
    assert first.json()["id"] == target
    assert first.json()["read_at"] is not None
    assert unread(client) == 2

    second = client.post(f"/notifications/{target}/read", headers=auth(ALICE_TOKEN))

    assert second.status_code == 200
    assert second.json() == first.json()
    assert unread(client) == 2
    assert unread(client, BOB_TOKEN) == 2
    stored = read_at_of(engine, target)
    assert stored.astimezone(timezone.utc).isoformat().replace("+00:00", "Z") == (
        first.json()["read_at"]
    )


def test_marking_read_keeps_an_existing_read_at(engine, client) -> None:
    original = datetime(2026, 1, 2, 3, 4, 5, tzinfo=timezone.utc)
    notification_id = add(engine, ALICE_ID, read_at=original)

    response = client.post(
        f"/notifications/{notification_id}/read", headers=auth(ALICE_TOKEN)
    )

    assert response.status_code == 200
    assert response.json()["read_at"] == "2026-01-02T03:04:05Z"
    assert read_at_of(engine, notification_id) == original


def test_marking_read_returns_the_dto(engine, client) -> None:
    notification_id = add(
        engine,
        ALICE_ID,
        type_="order.cancelled",
        params={"cancelled_by_role": "requester", "previous_status": "picked_up"},
    )

    body = client.post(
        f"/notifications/{notification_id}/read", headers=auth(ALICE_TOKEN)
    ).json()
    listed = client.get("/notifications", headers=auth(ALICE_TOKEN)).json()["items"][0]

    assert body == listed
    assert body["params"] == {
        "cancelled_by_role": "requester",
        "previous_status": "picked_up",
    }


def test_alice_gets_404_for_bobs_notification(engine, client) -> None:
    bob_id = add(engine, BOB_ID)
    add(engine, ALICE_ID)

    response = client.post(f"/notifications/{bob_id}/read", headers=auth(ALICE_TOKEN))

    assert response.status_code == 404
    assert read_at_of(engine, bob_id) is None
    assert unread(client, BOB_TOKEN) == 1
    assert unread(client) == 1


@pytest.mark.parametrize("offset", [1, 1000])
def test_unknown_id_returns_404(engine, client, offset) -> None:
    notification_id = add(engine, ALICE_ID)

    response = client.post(
        f"/notifications/{notification_id + offset}/read", headers=auth(ALICE_TOKEN)
    )

    assert response.status_code == 404


@pytest.mark.parametrize("notification_id", [0, -1, 2**63, -(2**63) - 1, 10**30])
def test_out_of_range_id_returns_404(engine, client, notification_id) -> None:
    add(engine, ALICE_ID)

    response = client.post(
        f"/notifications/{notification_id}/read", headers=auth(ALICE_TOKEN)
    )

    assert response.status_code == 404


def test_read_all_marks_every_unread_notification(engine, client) -> None:
    earlier = datetime(2026, 1, 1, tzinfo=timezone.utc)
    already_read = add(engine, ALICE_ID, read_at=earlier)
    add_interleaved(engine, alice=4, bob=3)
    assert unread(client) == 4

    response = client.post("/notifications/read-all", headers=auth(ALICE_TOKEN))

    assert response.status_code == 200
    assert response.json() == {"updated": 4}
    assert unread(client) == 0
    assert unread(client, BOB_TOKEN) == 3
    assert read_at_of(engine, already_read) == earlier
    items = client.get("/notifications", headers=auth(ALICE_TOKEN)).json()["items"]
    assert all(item["read_at"] is not None for item in items)


def test_read_all_with_nothing_unread_returns_zero(engine, client) -> None:
    add(engine, ALICE_ID, read_at=datetime(2026, 1, 1, tzinfo=timezone.utc))

    first = client.post("/notifications/read-all", headers=auth(ALICE_TOKEN))
    empty_user = client.post("/notifications/read-all", headers=auth(EMPTY_TOKEN))

    assert first.json() == {"updated": 0}
    assert empty_user.json() == {"updated": 0}


def test_read_all_twice_reports_zero_the_second_time(engine, client) -> None:
    add_interleaved(engine, alice=2, bob=0)

    assert client.post("/notifications/read-all", headers=auth(ALICE_TOKEN)).json() == {
        "updated": 2
    }
    assert client.post("/notifications/read-all", headers=auth(ALICE_TOKEN)).json() == {
        "updated": 0
    }


def test_concurrent_reads_both_succeed_with_one_read_at(engine, client) -> None:
    notification_id = add(engine, ALICE_ID)
    results: list[Any] = [None, None]

    def mark(index: int) -> None:
        results[index] = client.post(
            f"/notifications/{notification_id}/read", headers=auth(ALICE_TOKEN)
        )

    # Hold the row lock so that both requests are waiting on it at once.
    with engine.connect() as holder:
        holder.execute(
            text("SELECT id FROM notifications WHERE id = :id FOR UPDATE"),
            {"id": notification_id},
        )
        threads = [threading.Thread(target=mark, args=(index,)) for index in (0, 1)]
        for thread in threads:
            thread.start()
        _wait_for_lock_waiters(engine, 2)
        holder.rollback()
        for thread in threads:
            thread.join(timeout=10)

    assert [result.status_code for result in results] == [200, 200]
    read_ats = {result.json()["read_at"] for result in results}
    assert len(read_ats) == 1
    stored = read_at_of(engine, notification_id)
    assert stored.astimezone(timezone.utc).isoformat().replace("+00:00", "Z") in read_ats
    assert unread(client) == 0


def _wait_for_lock_waiters(engine, expected: int) -> None:
    deadline = time.monotonic() + 10
    query = text(
        "SELECT count(*) FROM pg_stat_activity "
        "WHERE wait_event_type = 'Lock' AND datname = current_database() "
        "AND query LIKE 'UPDATE notifications%'"
    )
    while time.monotonic() < deadline:
        with engine.connect() as connection:
            if connection.scalar(query) >= expected:
                return
        time.sleep(0.05)
    pytest.fail(f"expected {expected} requests waiting on the row lock")


# --- Query plans ------------------------------------------------------------


def _populate_large_dataset(engine) -> None:
    """20,000 rows for 200 other users plus 300 for Alice, about 95% read."""

    with engine.begin() as connection:
        connection.execute(
            text(
                """
                INSERT INTO notifications
                    (recipient_id, recipient_role, event_id, order_id, type,
                     params, title, body, occurred_at, read_at)
                SELECT
                    CASE WHEN n % 67 = 0 THEN CAST(:alice AS uuid)
                         ELSE md5('user' || (n % 200))::uuid END,
                    'requester', gen_random_uuid(), gen_random_uuid(),
                    'order.accepted', '{}'::jsonb, 'Order accepted',
                    'A courier accepted your order.', now(),
                    CASE WHEN n % 20 = 0 THEN NULL ELSE now() END
                FROM generate_series(1, 20300) AS n
                """
            ),
            {"alice": str(ALICE_ID)},
        )
        connection.execute(text("ANALYZE notifications"))


def _plan_nodes(plan: dict) -> list[dict]:
    nodes = [plan]
    for child in plan.get("Plans", []):
        nodes.extend(_plan_nodes(child))
    return nodes


def test_queries_use_the_indexes_without_sequential_scans(engine, client) -> None:
    _populate_large_dataset(engine)
    with engine.connect() as connection:
        some_id = connection.scalar(
            text("SELECT max(id) FROM notifications WHERE recipient_id = :alice"),
            {"alice": ALICE_ID},
        )

    captured: list[tuple[str, Any]] = []

    def capture(_conn, _cursor, statement, parameters, _context, _executemany):
        if "notifications" in statement:
            captured.append((statement, parameters))

    app_engine = client.app.state.engine
    event.listen(app_engine, "before_cursor_execute", capture)
    try:
        requests = {
            "list": lambda: client.get("/notifications", headers=auth(ALICE_TOKEN)),
            "list_cursor": lambda: client.get(
                f"/notifications?cursor={some_id}&limit=100", headers=auth(ALICE_TOKEN)
            ),
            "count": lambda: client.get(
                "/notifications/unread-count", headers=auth(ALICE_TOKEN)
            ),
            "read": lambda: client.post(
                f"/notifications/{some_id}/read", headers=auth(ALICE_TOKEN)
            ),
            "read_all": lambda: client.post(
                "/notifications/read-all", headers=auth(ALICE_TOKEN)
            ),
        }
        statements = {}
        for name, send in requests.items():
            captured.clear()
            assert send().status_code == 200
            assert len(captured) == 1, captured
            statements[name] = captured[0]
    finally:
        event.remove(app_engine, "before_cursor_execute", capture)

    expected_index = {
        "list": "ix_notifications_recipient_id_desc",
        "list_cursor": "ix_notifications_recipient_id_desc",
        "count": "ix_notifications_recipient_unread",
        "read": None,
        "read_all": "ix_notifications_recipient_unread",
    }
    with engine.connect() as connection:
        for name, (statement, parameters) in statements.items():
            with connection.begin():
                plan = connection.exec_driver_sql(
                    f"EXPLAIN (FORMAT JSON) {statement}", parameters
                ).scalar()[0]["Plan"]
                connection.rollback()
            nodes = _plan_nodes(plan)
            assert all(node["Node Type"] != "Seq Scan" for node in nodes), (name, plan)
            index_names = {node["Index Name"] for node in nodes if "Index Name" in node}
            if expected_index[name] is not None:
                assert index_names == {expected_index[name]}, (name, plan)
            else:
                assert index_names, (name, plan)
