# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09, 2026-10-11
# Scope: Implemented and debugged foundation migration and runtime permissions tests.
# Author review: I validated correctness and added boundary checks where needed.

"""Explicitly enabled, read-only checks: never reset or populate the target."""

import os

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.core.config import Settings
from app.db import Database
from app.main import create_app

pytestmark = pytest.mark.integration


@pytest.fixture
def database_url():
    value = os.environ.get("ORDER_TEST_DATABASE_URL")
    if not value:
        pytest.skip("Set ORDER_TEST_DATABASE_URL to an isolated migrated Order database")
    return value


async def test_migrated_database_is_ready(database_url):
    database = Database(database_url)
    app = create_app(Settings(_env_file=None, database_url=None), database)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app), base_url="http://test") as client:
            assert (await client.get("/health/live")).status_code == 200
            assert (await client.get("/health/ready")).json() == {"status": "ready"}


async def test_migration_establishes_service_owned_schema(database_url):
    database = Database(database_url)
    try:
        async for session in database.session():
            assert await session.scalar(
                text("SELECT has_schema_privilege('order_service_app', 'order_service', 'USAGE')")
            )
            assert not await session.scalar(
                text("SELECT has_schema_privilege('order_service_app', 'order_service', 'CREATE')")
            )
            for role in ("anon", "authenticated", "service_role"):
                assert not await session.scalar(
                    text("SELECT has_schema_privilege(:role, 'order_service', 'USAGE')"),
                    {"role": role},
                )
            assert (
                await session.scalar(
                    text(
                        "SELECT count(*) FROM information_schema.tables "
                        "WHERE table_schema='order_service'"
                    )
                )
                == 4
            )
            assert (
                await session.scalar(
                    text(
                        "SELECT count(*) FROM pg_namespace "
                        "WHERE nspname IN ('user_service', 'supplier_service', 'credit_service')"
                    )
                )
                == 0
            )
    finally:
        await database.dispose()
