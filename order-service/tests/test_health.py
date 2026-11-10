# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11
# Scope: Implemented and debugged health endpoints tests.
# Author review: I validated correctness and added boundary checks where needed.

from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.db import Database
from app.main import create_app


def build_app(database):
    return create_app(Settings(_env_file=None, environment="test", database_url=None), database)


async def test_startup_and_liveness_do_not_connect_and_shutdown_disposes():
    database = AsyncMock(spec=Database)
    app = build_app(database)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app), base_url="http://test") as client:
            response = await client.get("/health/live")
        assert response.status_code == 200
        assert response.json() == {"status": "live"}
        database.ping.assert_not_awaited()
    database.dispose.assert_awaited_once()


@pytest.mark.parametrize("ready", [True, False])
async def test_readiness_response(ready):
    database = AsyncMock(spec=Database)
    database.ping.return_value = ready
    app = build_app(database)
    async with AsyncClient(transport=ASGITransport(app), base_url="http://test") as client:
        response = await client.get("/health/ready", headers={"X-Correlation-ID": "probe-1"})
    assert response.headers["X-Correlation-ID"] == "probe-1"
    assert response.status_code == (200 if ready else 503)
    assert response.json() == ({"status": "ready"} if ready else {"error": {
        "code": "SERVICE_NOT_READY",
        "message": "The Order database is not ready.",
        "correlationId": "probe-1",
        "fieldErrors": [],
    }})


@pytest.mark.parametrize("request_id", ["", "bad value", "a" * 129])
async def test_invalid_request_ids_are_replaced(request_id):
    app = build_app(Database(None))
    async with AsyncClient(transport=ASGITransport(app), base_url="http://test") as client:
        response = await client.get("/health/live", headers={"X-Correlation-ID": request_id})
    assert UUID(response.headers["X-Correlation-ID"])


async def test_missing_database_does_not_break_startup_or_liveness():
    app = build_app(Database(None))
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app), base_url="http://test") as client:
            assert (await client.get("/health/live")).status_code == 200
            assert (await client.get("/health/ready")).status_code == 503


async def test_production_hides_docs():
    app = create_app(Settings(_env_file=None, environment="production", database_url=None))
    async with AsyncClient(transport=ASGITransport(app), base_url="http://test") as client:
        assert (await client.get("/docs")).status_code == 404
