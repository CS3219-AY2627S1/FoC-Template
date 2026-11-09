# AI-influenced: ported from the standalone chat-service with Claude (Opus 5.5);
# see ai/usage-log.md.
"""Tests run against a real PostgreSQL (the schema relies on JSONB, GIN, partial
indexes and row locks, so SQLite would test a different system).

    pytest --postgres-url postgresql+asyncpg://foc:foc@localhost:5432/chat_test
    # or: CHAT_TEST_DATABASE_URL=... pytest

Without a URL every test is skipped. The tests drop and recreate the chat tables in
that database, so never point them at a database you care about.
"""

from __future__ import annotations

import asyncio
import os
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from starlette.testclient import WebSocketTestSession

import app.models  # noqa: F401
from app.config import Settings
from app.main import create_app
from app.models.base import Base

SERVICE = {"X-Service-Key": "test-service-key"}
TEST_DB = os.environ.get("CHAT_TEST_DATABASE_URL", "")


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption("--postgres-url", help="Asyncpg URL of a throwaway PostgreSQL database")


def pytest_configure(config: pytest.Config) -> None:
    global TEST_DB
    TEST_DB = config.getoption("--postgres-url") or TEST_DB


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    if TEST_DB:
        return
    skip = pytest.mark.skip(reason="pass --postgres-url (or CHAT_TEST_DATABASE_URL) to run")
    for item in items:
        item.add_marker(skip)


def make_settings(**overrides: Any) -> Settings:
    base: dict[str, Any] = {
        "database_url": TEST_DB,
        "chat_auth_mode": "gateway",
        "jwt_secret": "test-secret-0123456789abcdef-0123456789",
        "chat_service_keys": "test-service-key",
        "rabbitmq_url": None,
        "purge_interval_s": 3600,
        "outbox_poll_interval_s": 3600,
        "typing_min_interval_s": 0,
        "log_level": "WARNING",
    }
    base.update(overrides)
    return Settings(_env_file=None, **base)


async def _reset_schema() -> None:
    engine = create_async_engine(TEST_DB)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.execute(text("DROP TYPE IF EXISTS conversation_kind"))
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()


async def truncate_all() -> None:
    engine = create_async_engine(TEST_DB)
    async with engine.begin() as conn:
        tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
        await conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    await engine.dispose()


@pytest.fixture(scope="session", autouse=True)
def schema() -> None:
    if TEST_DB:
        asyncio.run(_reset_schema())


@pytest.fixture
def settings() -> Settings:
    return make_settings()


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    asyncio.run(truncate_all())
    with TestClient(create_app(settings)) as c:
        yield c


class User:
    """A user as the gateway presents it: an id in the trusted X-User-Id header."""

    def __init__(self, name: str):
        self.id = str(uuid.uuid4())
        self.name = name
        self.headers = {"X-User-Id": self.id}


@pytest.fixture
def users() -> dict[str, User]:
    return {n: User(n) for n in ("alice", "bob", "carol")}


def ticket(client: TestClient, user: User) -> str:
    res = client.post("/chat/ws-ticket", headers=user.headers)
    assert res.status_code == 201, res.text
    return res.json()["ticket"]


@contextmanager
def socket(client: TestClient, user: User) -> Iterator[WebSocketTestSession]:
    with client.websocket_connect(f"/chat/ws?ticket={ticket(client, user)}") as ws:
        ready = ws.receive_json()
        assert ready["type"] == "ready", ready
        assert ready["data"]["user_id"] == user.id
        yield ws


def expect(ws: WebSocketTestSession, type_: str, *, skip: tuple[str, ...] = ()) -> dict[str, Any]:
    """Next frame must be `type_` (frames whose type is in `skip` are ignored)."""
    while True:
        frame = ws.receive_json()
        if frame["type"] in skip:
            continue
        assert frame["type"] == type_, frame
        return frame


def assert_quiet(ws: WebSocketTestSession) -> None:
    """Nothing else is queued for this socket: a ping's pong must be the very next frame."""
    ws.send_json({"type": "ping", "req_id": "quiet"})
    frame = ws.receive_json()
    assert frame == {"type": "pong", "req_id": "quiet"}, frame


def send(
    ws: WebSocketTestSession, conversation_id: str, body: str | None = "hi", **extra: Any
) -> dict[str, Any]:
    req = uuid.uuid4().hex
    data = {
        "conversation_id": conversation_id,
        "client_msg_id": str(uuid.uuid4()),
        "kind": "text",
        "body": body,
    }
    data.update(extra)
    ws.send_json({"type": "send", "req_id": req, "data": data})
    return expect(ws, "ack") | {"_sent": data}


def direct(client: TestClient, a: User, b: User) -> str:
    res = client.post("/chat/conversations/direct", json={"user_id": b.id}, headers=a.headers)
    res.raise_for_status()
    return res.json()["id"]
