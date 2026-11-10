# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-10
# Scope: Added or extended tests for username search validation.
# Author review: I validated correctness and added boundary checks where needed.

from __future__ import annotations

import base64
import json
from types import SimpleNamespace
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.exc import OperationalError

from app.api.chat import require_chat_caller
from app.api.errors import ApiError
from app.chat.service import _decode_cursor
from app.core.config import Settings
from app.main import create_app


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"v": 2, "query": "abc", "username": "abc", "user_id": str(uuid4())},
        {"v": 1, "query": "abc", "username": "ABC", "user_id": str(uuid4())},
        {"v": 1, "query": "abc", "username": "abc", "user_id": "bad"},
        {"v": 1, "query": "abc", "username": "abc", "user_id": str(uuid4()), "extra": "secret"},
        {"v": 1, "query": "other", "username": "abc", "user_id": str(uuid4())},
    ],
)
def test_cursor_rejects_untrusted_shapes_without_echoing_values(payload) -> None:
    value = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    with pytest.raises(ApiError) as caught:
        _decode_cursor(value, query="abc")
    assert caught.value.status_code == 422
    assert "secret" not in caught.value.message


@pytest.mark.parametrize(
    "failure",
    [
        None,
        OSError("secret-connection-string"),
        OperationalError("private-sql", {}, Exception("secret")),
    ],
)
async def test_search_database_outage_is_safe_and_identity_is_checked_first(failure) -> None:
    settings = Settings(_env_file=None, chat_service_shared_secret="chat-test-only")
    app = create_app(settings=settings)
    if failure is not None:

        async def broken_session():
            raise failure
            yield  # noqa: B901

        app.state.database.session = broken_session
    app.dependency_overrides[require_chat_caller] = lambda: SimpleNamespace(
        user=SimpleNamespace(id=uuid4()),
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        denied = await client.get("/v1/internal/chat/users", params={"username": "abc"})
        assert denied.status_code == 401
        unavailable = await client.get(
            "/v1/internal/chat/users",
            params={"username": "abc"},
            headers={"X-FoC-Service-Secret": "chat-test-only"},
        )
    assert unavailable.status_code == 503
    assert unavailable.json()["error"]["code"] == "SERVICE_NOT_READY"
    assert unavailable.headers["Cache-Control"] == "no-store"
    for sensitive in ("secret-connection-string", "private-sql", "chat-test-only"):
        assert sensitive not in unavailable.text
