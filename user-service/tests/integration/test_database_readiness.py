# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-20
# Scope: Added or extended tests for database readiness.
# Author review: I validated correctness and added boundary checks where needed.

from __future__ import annotations

import os

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.db import Database
from app.main import create_app


@pytest.mark.asyncio
@pytest.mark.integration
async def test_ready_probes_a_configured_local_supabase_database() -> None:
    database_url = os.getenv("USER_SERVICE_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set USER_SERVICE_TEST_DATABASE_URL or use the local Supabase test helper.")

    database = Database(database_url)
    app = create_app(settings=Settings(_env_file=None, environment="test"), database=database)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/health/ready")
    finally:
        await database.dispose()

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}
