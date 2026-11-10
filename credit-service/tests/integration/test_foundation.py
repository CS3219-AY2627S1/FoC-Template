# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-13
# Scope: Added schema and runtime-role integration tests.
# Author review: I validated correctness and supplied additional boundary checks.

"""Requires CREDIT_TEST_DATABASE_URL: a DISPOSABLE migrated Credit database (admin URL)."""

import os

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.core.config import Settings
from app.db import Database
from app.main import create_app

pytestmark = pytest.mark.integration

TABLES = {
    "wallets",
    "order_reservations",
    "credit_transactions",
    "processed_events",
    "event_failures",
}


@pytest.fixture
async def database():
    url = os.environ.get("CREDIT_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set CREDIT_TEST_DATABASE_URL to a disposable migrated Credit database")
    database = Database(url)
    yield database
    await database.dispose()


async def test_migrated_database_is_ready(database):
    app = create_app(Settings(_env_file=None), database)
    async with AsyncClient(transport=ASGITransport(app), base_url="http://test") as client:
        assert (await client.get("/health/ready")).json() == {"status": "ready"}


async def test_schema_is_service_owned(database):
    async with database.session_context() as session:
        names = set(
            (
                await session.scalars(
                    text(
                        "SELECT table_name FROM information_schema.tables "
                        "WHERE table_schema='credit_service'"
                    )
                )
            ).all()
        )
        assert names == TABLES
        assert not await session.scalar(
            text("SELECT has_schema_privilege('credit_service_app', 'credit_service', 'CREATE')")
        )
        for role in ("anon", "authenticated", "service_role"):
            assert not await session.scalar(
                text("SELECT has_schema_privilege(:role, 'credit_service', 'USAGE')"),
                {"role": role},
            )


async def privilege(database, sql: str, **params) -> bool:
    # Checked like Order's foundation tests: Supabase's local admin cannot SET ROLE.
    async with database.session_context() as session:
        return await session.scalar(text(sql), params)


@pytest.mark.parametrize(
    "table, action",
    [
        ("credit_transactions", "UPDATE"),
        ("credit_transactions", "DELETE"),
        ("credit_transactions", "TRUNCATE"),
        ("wallets", "DELETE"),
        ("order_reservations", "DELETE"),
        ("processed_events", "UPDATE"),
        ("processed_events", "DELETE"),
        ("event_failures", "UPDATE"),
    ],
)
async def test_runtime_role_cannot_rewrite_history(database, table, action):
    # M4NFR4.3: ordinary credit operations cannot alter transaction records.
    assert not await privilege(
        database,
        "SELECT has_table_privilege('credit_service_app', :table, :action)",
        table=f"credit_service.{table}",
        action=action,
    )


@pytest.mark.parametrize(
    "table, column, allowed",
    [
        ("wallets", "available", True),
        ("wallets", "reserved", True),
        ("wallets", "user_id", False),
        ("order_reservations", "state", True),
        ("order_reservations", "amount", False),
        ("order_reservations", "requester_id", False),
    ],
)
async def test_runtime_role_updates_only_mutable_columns(database, table, column, allowed):
    assert (
        await privilege(
            database,
            "SELECT has_column_privilege('credit_service_app', :table, :column, 'UPDATE')",
            table=f"credit_service.{table}",
            column=column,
        )
        is allowed
    )


async def test_runtime_role_can_append_to_ledger(database):
    for action in ("SELECT", "INSERT"):
        assert await privilege(
            database,
            "SELECT has_table_privilege('credit_service_app', "
            "'credit_service.credit_transactions', :action)",
            action=action,
        )


async def test_balances_cannot_go_negative(database):
    # M4NFR1.2 is also a database invariant, not only application logic.
    async with database.session_context() as session:
        with pytest.raises(DBAPIError, match="check constraint"):
            async with session.begin():
                await session.execute(
                    text(
                        "INSERT INTO credit_service.wallets (user_id, available, reserved) "
                        "VALUES (gen_random_uuid(), -1, 0)"
                    )
                )
