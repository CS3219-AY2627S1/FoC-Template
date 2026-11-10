# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-10
# Scope: Added or extended tests for startup and configuration.
# Author review: I validated correctness and added boundary checks where needed.

import httpx
import pytest

from app.config import Settings
from app.main import create_app


@pytest.mark.asyncio
async def test_health_and_safe_errors():
    app = create_app(Settings(_env_file=None))
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://chat"
    ) as client:
        response = await client.get("/health/live", headers={"X-Correlation-ID": "test-id"})
        assert response.json() == {"status": "live"}
        assert response.headers["X-Correlation-ID"] == "test-id"
        response = await client.get("/health/ready")
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "SERVICE_NOT_READY"


def test_secrets_redacted():
    settings = Settings(
        _env_file=None,
        database_url="secret-db",
        rabbitmq_url="secret-broker",
        chat_service_shared_secret="secret-chat",
    )
    assert "secret-db" not in repr(settings)
    assert "secret-broker" not in repr(settings)
    assert "secret-chat" not in repr(settings)
