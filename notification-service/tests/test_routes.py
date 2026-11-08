from __future__ import annotations

from collections.abc import AsyncGenerator
from datetime import datetime

import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db import Base, get_session
from app.main import app
from app.models.notification import Notification

USER1 = {"X-User-Id": "user-1", "X-User-Role": "client"}
USER2 = {"X-User-Id": "user-2", "X-User-Role": "client"}
ADMIN = {"X-User-Id": "admin-1", "X-User-Role": "admin"}


def _row(notification_id: str, recipient_id: str, name: str, created: datetime, *, read=False):
    return Notification(
        notification_id=notification_id,
        recipient_id=recipient_id,
        event_id=f"evt-{notification_id}",
        event_type="OrderAccepted",
        order_id=f"order-{notification_id}",
        order_name=name,
        order_status="ACCEPTED",
        title="Courier found",
        body=f'A courier accepted "{name}".',
        created_at=created,
        read_at=datetime(2026, 1, 2, 9, 0, 0) if read else None,
    )


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[TestClient, None]:
    from app import models  # noqa: F401

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True, poolclass=StaticPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)

    async with maker() as s:
        s.add_all(
            [
                _row("n1", "user-1", "Alpha", datetime(2026, 1, 1, 10, 0, 0), read=True),
                _row("n2", "user-1", "Beta", datetime(2026, 1, 1, 11, 0, 0)),
                _row("n3", "user-1", "Gamma", datetime(2026, 1, 1, 12, 0, 0)),
                _row("n4", "user-2", "Delta", datetime(2026, 1, 1, 12, 30, 0)),
            ]
        )
        await s.commit()

    async def _override() -> AsyncGenerator[AsyncSession, None]:
        async with maker() as s:
            yield s

    app.dependency_overrides[get_session] = _override
    c = TestClient(app)
    yield c
    app.dependency_overrides.clear()
    await engine.dispose()


# ── list (F1.1.3) ───────────────────────────────────────────────────────────


def test_list_returns_items_newest_first_with_counts_F1_1_3(client):
    resp = client.get("/notifications/user-1", headers=USER1)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 3
    assert body["unread_count"] == 2
    assert [i["order_name"] for i in body["items"]] == ["Gamma", "Beta", "Alpha"]
    assert body["items"][0]["order_status"] == "ACCEPTED"
    assert body["items"][-1]["read_at"] is not None


def test_list_pagination_limit_offset(client):
    first = client.get("/notifications/user-1?limit=1&offset=0", headers=USER1).json()
    assert [i["order_name"] for i in first["items"]] == ["Gamma"]
    assert first["total"] == 3

    second = client.get("/notifications/user-1?limit=1&offset=1", headers=USER1).json()
    assert [i["order_name"] for i in second["items"]] == ["Beta"]


def test_list_unread_only_filters(client):
    body = client.get("/notifications/user-1?unread_only=true", headers=USER1).json()
    assert [i["order_name"] for i in body["items"]] == ["Gamma", "Beta"]
    assert body["unread_count"] == 2


# ── auth (N4.1) ───────────────────────────────────────────────────────────────


def test_list_without_identity_is_401_not_403_N4_1(client):
    resp = client.get("/notifications/user-1")
    assert resp.status_code == 401
    assert resp.json()["code"] == "unauthorized"


def test_list_of_other_user_forbidden_for_client(client):
    resp = client.get("/notifications/user-2", headers=USER1)
    assert resp.status_code == 403
    assert resp.json()["code"] == "forbidden"


def test_admin_can_read_other_user_list(client):
    resp = client.get("/notifications/user-1", headers=ADMIN)
    assert resp.status_code == 200
    assert resp.json()["total"] == 3


# ── mark read ─────────────────────────────────────────────────────────────────


def test_mark_one_marks_row_read(client):
    resp = client.post("/notifications/user-1/n2/read", headers=USER1)
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}

    body = client.get("/notifications/user-1", headers=USER1).json()
    assert body["unread_count"] == 1
    n2 = next(i for i in body["items"] if i["notification_id"] == "n2")
    assert n2["read_at"] is not None


def test_mark_one_owned_by_other_user_is_404(client):
    resp = client.post("/notifications/user-1/n4/read", headers=USER1)
    assert resp.status_code == 404
    assert resp.json()["code"] == "not_found"


def test_mark_all_marks_callers_unread_and_returns_count(client):
    resp = client.post("/notifications/user-1/read-all", headers=USER1)
    assert resp.status_code == 200
    assert resp.json() == {"marked_read": 2, "unread_count": 0}

    body = client.get("/notifications/user-1", headers=USER1).json()
    assert body["unread_count"] == 0
