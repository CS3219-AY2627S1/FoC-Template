# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28
# Scope: Added liveness and readiness tests.
# Author review: I validated correctness and supplied additional boundary checks.

from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.main import create_app
from tests.admin_fakes import NoDatabase


async def test_liveness_does_not_need_database_and_readiness_fails_closed():
    app = create_app(Settings(_env_file=None), NoDatabase())
    async with AsyncClient(transport=ASGITransport(app), base_url="http://test") as client:
        live = await client.get("/health/live")
        ready = await client.get("/health/ready", headers={"X-Correlation-ID": "demo-1"})
    assert live.json() == {"status": "live"}
    assert ready.status_code == 503
    assert ready.json()["error"]["code"] == "SERVICE_NOT_READY"
    assert ready.json()["error"]["correlationId"] == "demo-1"
    assert ready.headers["X-Correlation-ID"] == "demo-1"


async def test_unsafe_correlation_id_is_replaced():
    app = create_app(Settings(_env_file=None), NoDatabase())
    async with AsyncClient(transport=ASGITransport(app), base_url="http://test") as client:
        response = await client.get("/health/live", headers={"X-Correlation-ID": "<script>"})
    assert response.headers["X-Correlation-ID"] != "<script>"
    assert response.headers["X-Correlation-ID"].isalnum()
