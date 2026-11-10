# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-10, 2026-10-11
# Scope: Added or extended tests for participant lookup errors.
# Author review: I validated correctness and added boundary checks where needed.

from __future__ import annotations

import socket
from types import SimpleNamespace
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.exc import OperationalError

from app.api.chat import require_chat_caller
from app.core.config import Settings
from app.main import create_app


@pytest.mark.parametrize(
    "failure",
    [None, OSError("private-db-url"), OperationalError("private-query", {}, Exception("secret"))],
)
async def test_participant_database_failure_never_fabricates_missing_ids(failure) -> None:
    app = create_app(settings=Settings(_env_file=None, chat_service_shared_secret="chat-only"))
    if failure is not None:

        async def broken_session():
            raise failure
            yield

        app.state.database.session = broken_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/v1/internal/chat/participants",
            headers={
                "X-FoC-Service-Secret": "chat-only",
                "X-Correlation-ID": "lookup-trace",
            },
            json={"userIds": [str(uuid4())]},
        )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "SERVICE_NOT_READY"
    assert response.json()["error"]["correlationId"] == "lookup-trace"
    assert response.headers["Cache-Control"] == "no-store"
    for value in ("private-db-url", "private-query", "chat-only", "missingUserIds"):
        assert value not in response.text


@pytest.mark.parametrize("operation", ["search", "participants"])
async def test_connection_refusal_during_query_returns_service_unavailable(operation) -> None:
    # Reserve an unused local port without listening; exercise the actual asyncpg
    # connection path after the request dependency has yielded its SQLAlchemy session.
    with socket.socket() as unused_listener:
        unused_listener.bind(("127.0.0.1", 0))
        port = unused_listener.getsockname()[1]
        app = create_app(
            settings=Settings(
                _env_file=None,
                chat_service_shared_secret="chat-only",
                database_url=f"postgresql://unused:private-test-password@127.0.0.1:{port}/postgres",
            )
        )
        app.dependency_overrides[require_chat_caller] = lambda: SimpleNamespace(
            user=SimpleNamespace(id=uuid4()),
        )
        try:
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                headers = {"X-FoC-Service-Secret": "chat-only"}
                if operation == "search":
                    response = await client.get(
                        "/v1/internal/chat/users", headers=headers, params={"username": "abc"}
                    )
                else:
                    response = await client.post(
                        "/v1/internal/chat/participants",
                        headers=headers,
                        json={"userIds": [str(uuid4())]},
                    )
            assert response.status_code == 503
            assert response.json()["error"]["code"] == "SERVICE_NOT_READY"
            assert response.headers["Cache-Control"] == "no-store"
            assert "private-test-password" not in response.text
        finally:
            await app.state.database.dispose()
