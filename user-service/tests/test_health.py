# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-20
# Scope: Added or extended tests for liveness, readiness, and correlation IDs on failures.
# Author review: I validated correctness and added boundary checks where needed.

from __future__ import annotations

from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.main import create_app


class StubDatabase:
    def __init__(self, ready: bool) -> None:
        self.ready = ready
        self.ping_calls = 0

    async def ping(self) -> bool:
        self.ping_calls += 1
        return self.ready

    async def dispose(self) -> None:
        return None


def build_test_app(database_ready: bool):
    return create_app(
        settings=Settings(_env_file=None, environment="test"),
        database=StubDatabase(database_ready),  # type: ignore[arg-type]
    )


@pytest.mark.asyncio
async def test_live_reports_service_status_and_echoes_safe_correlation_id() -> None:
    app = build_test_app(database_ready=False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health/live", headers={"X-Correlation-ID": "request-42"})

    assert response.status_code == 200
    assert response.json() == {"status": "live"}
    assert response.headers["X-Correlation-ID"] == "request-42"


@pytest.mark.asyncio
async def test_live_replaces_malformed_correlation_id() -> None:
    app = build_test_app(database_ready=False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health/live", headers={"X-Correlation-ID": "bad value"})

    assert response.status_code == 200
    assert UUID(hex=response.headers["X-Correlation-ID"])


@pytest.mark.asyncio
async def test_ready_returns_ok_when_postgresql_probe_succeeds() -> None:
    app = build_test_app(database_ready=True)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


@pytest.mark.asyncio
async def test_ready_returns_safe_error_when_postgresql_probe_fails() -> None:
    app = build_test_app(database_ready=False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health/ready", headers={"X-Correlation-ID": "readiness-1"})

    assert response.status_code == 503
    assert response.headers["X-Correlation-ID"] == "readiness-1"
    assert response.json() == {
        "error": {
            "code": "SERVICE_NOT_READY",
            "message": "A required service dependency is not ready.",
            "correlationId": "readiness-1",
            "fieldErrors": [],
        }
    }


@pytest.mark.asyncio
async def test_lifespan_defers_database_probe_so_liveness_can_start_promptly() -> None:
    database = StubDatabase(ready=False)
    app = create_app(
        settings=Settings(_env_file=None, environment="test"),
        database=database,  # type: ignore[arg-type]
    )

    async with app.router.lifespan_context(app):
        assert database.ping_calls == 0


@pytest.mark.asyncio
async def test_unhandled_errors_keep_the_request_correlation_id() -> None:
    app = build_test_app(database_ready=True)

    @app.get("/test-unhandled-error")
    async def raise_unhandled_error() -> None:
        raise RuntimeError("test-only failure")

    async with AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test"
    ) as client:
        response = await client.get(
            "/test-unhandled-error", headers={"X-Correlation-ID": "failure-42"}
        )

    assert response.status_code == 500
    assert response.headers["X-Correlation-ID"] == "failure-42"
    assert response.json() == {
        "error": {
            "code": "INTERNAL_SERVER_ERROR",
            "message": "An unexpected service error occurred.",
            "correlationId": "failure-42",
            "fieldErrors": [],
        }
    }
