# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28
# Scope: Added schema and runtime-role integration tests.
# Author review: I validated correctness and supplied additional boundary checks.

"""Requires ADMIN_TEST_DATABASE_URL: a DISPOSABLE migrated Admin database (admin URL)."""

import os

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.core.config import Settings
from app.db import Database
from app.main import create_app

pytestmark = pytest.mark.integration


@pytest.fixture
async def database():
    url = os.environ.get("ADMIN_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set ADMIN_TEST_DATABASE_URL to a disposable migrated Admin database")
    database = Database(url)
    yield database
    await database.dispose()


async def test_migrated_database_is_ready(database):
    app = create_app(Settings(_env_file=None), database)
    async with AsyncClient(transport=ASGITransport(app), base_url="http://test") as client:
        assert (await client.get("/health/ready")).json() == {"status": "ready"}


async def test_schema_is_service_owned_and_runtime_role_is_restricted(database):
    async with database.session_context() as session:
        usage, create = (
            await session.execute(
                text(
                    "SELECT has_schema_privilege('admin_service_app', 'admin_service', 'USAGE'), "
                    "has_schema_privilege('admin_service_app', 'admin_service', 'CREATE')"
                )
            )
        ).one()
        public_usage = await session.scalar(
            text(
                "SELECT EXISTS (SELECT 1 FROM pg_namespace n, aclexplode(n.nspacl) a "
                "WHERE n.nspname = 'admin_service' AND a.grantee = 0)"
            )
        )
        can_login = await session.scalar(
            text("SELECT rolcanlogin FROM pg_roles WHERE rolname = 'admin_service_app'")
        )
    assert (usage, create) == (True, False)
    assert public_usage is False
    assert can_login is False
