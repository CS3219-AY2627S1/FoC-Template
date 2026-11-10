# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-13
# Scope: Added liveness and readiness tests.
# Author review: I validated correctness and supplied additional boundary checks.

from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.main import create_app


class NoDatabase:
    async def ping(self):
        return False

    async def dispose(self):
        pass

    def session_context(self):
        raise AssertionError("health checks must not open sessions")


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
