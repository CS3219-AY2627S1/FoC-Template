# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-10
# Scope: Added or extended tests for Chat service authentication and request validation.
# Author review: I validated correctness and added boundary checks where needed.

from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi import Depends
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

from app.api.chat import require_chat_service_identity
from app.api.chat_schemas import ChatParticipantsRequest, ChatUserSearchQuery
from app.core.config import Settings
from app.main import create_app


@pytest.mark.parametrize("configured", [None, "", "   "])
async def test_unconfigured_chat_identity_fails_closed(configured: str | None) -> None:
    settings = Settings(_env_file=None, chat_service_shared_secret=configured)
    assert settings.chat_service_shared_secret is None
    app = create_app(settings=settings)

    @app.get("/identity-probe", dependencies=[Depends(require_chat_service_identity)])
    def probe():
        return {"ok": True}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/identity-probe", headers={"X-FoC-Service-Secret": "wrong"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_SERVICE_IDENTITY"


async def test_dedicated_identity_and_redacted_configuration(monkeypatch) -> None:
    monkeypatch.setenv("INTERNAL_SERVICE_SECRET", "legacy-supplier-only")
    settings = Settings(_env_file=None, chat_service_shared_secret="chat-only")
    assert "chat-only" not in repr(settings)
    assert "chat-only" not in settings.model_dump_json()
    assert Settings(_env_file=None).chat_service_shared_secret is None
    app = create_app(settings=settings)

    @app.get("/identity-probe", dependencies=[Depends(require_chat_service_identity)])
    def probe():
        return {"ok": True}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        for headers in (
            {},
            {"Authorization": "Bearer ordinary-token"},
            {"X-FoC-Service-Secret": "legacy-supplier-only"},
            {"X-FoC-Service-Secret": "wrong"},
        ):
            response = await client.get("/identity-probe", headers=headers)
            assert response.status_code == 401
            assert "chat-only" not in response.text
        assert (
            await client.get(
                "/identity-probe",
                headers={
                    "X-FoC-Service-Secret": "chat-only",
                },
            )
        ).status_code == 200
        supplier = await client.post(
            "/v1/internal/authorization-decisions",
            headers={
                "X-FoC-Service-Secret": "chat-only",
            },
            json={"action": "SUPPLIER_CREATE"},
        )
        assert supplier.status_code == 401
        assert supplier.json()["error"]["code"] == "INVALID_SERVICE_IDENTITY"


def test_strict_chat_requests() -> None:
    assert ChatUserSearchQuery(username="  Ab_%  ").username == "ab_%"
    user_id = uuid4()
    assert len(ChatParticipantsRequest(userIds=[user_id] * 100).user_ids) == 100
    for body in (
        {"userIds": []},
        {"userIds": [user_id] * 101},
        {"userIds": ["bad"]},
        {"userIds": [user_id], "email": "private"},
    ):
        with pytest.raises(ValidationError):
            ChatParticipantsRequest.model_validate(body)
    for query in (
        {"username": ""},
        {"username": " "},
        {"username": "a b"},
        {"username": "a" * 65},
        {"username": "abc", "limit": 0},
        {"username": "abc", "limit": 101},
        {"username": "abc", "role": "ADMIN"},
    ):
        with pytest.raises(ValidationError):
            ChatUserSearchQuery.model_validate(query)
