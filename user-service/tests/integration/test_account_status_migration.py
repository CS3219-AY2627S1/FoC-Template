# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-07
# Scope: Added or extended tests for account status migration behavior.
# Author review: I validated correctness and added boundary checks where needed.

"""Exercise canonical migrations in temporary databases, never the configured schema."""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from pathlib import Path
from uuid import uuid4

import asyncpg
import pytest
import pytest_asyncio

MIGRATIONS = Path(__file__).resolve().parents[2] / "supabase" / "migrations"
STATUS_MIGRATION = MIGRATIONS / "20261006172458_remove_suspended_account_status.sql"
pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def legacy_database() -> AsyncIterator[asyncpg.Connection]:
    """The local Supabase test connection needs CREATE DATABASE privileges."""
    database_url = os.getenv("USER_SERVICE_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set USER_SERVICE_TEST_DATABASE_URL or use the local Supabase test helper.")
    database_url = database_url.replace("postgresql+asyncpg://", "postgresql://", 1)
    database_name = f"account_status_test_{uuid4().hex}"
    admin = await asyncpg.connect(database_url)
    connection = None
    try:
        await admin.execute(f'CREATE DATABASE "{database_name}"')
        connection = await asyncpg.connect(database_url, database=database_name)
        for migration in sorted(MIGRATIONS.glob("*.sql")):
            if migration.name < STATUS_MIGRATION.name:
                sql = migration.read_text(encoding="utf-8")
                prelude, begin, transaction = sql.partition("\nBEGIN;")
                # Commit pre-transaction enum additions separately, as Supabase does.
                if begin:
                    if any(
                        line.strip() and not line.lstrip().startswith("--")
                        for line in prelude.splitlines()
                    ):
                        await connection.execute(prelude)
                    await connection.execute(begin + transaction)
                else:
                    await connection.execute(sql)
        yield connection
    finally:
        if connection is not None:
            await connection.close()
        await admin.execute(f'DROP DATABASE IF EXISTS "{database_name}"')
        await admin.close()


async def account_status_labels(connection: asyncpg.Connection) -> list[str]:
    rows = await connection.fetch(
        """SELECT enumlabel FROM pg_enum
           WHERE enumtypid = 'user_service.account_status'::regtype
           ORDER BY enumsortorder"""
    )
    return [row["enumlabel"] for row in rows]


async def identity_snapshot(connection: asyncpg.Connection) -> dict[str, list[str]]:
    result = {}
    for table in ("users", "credentials", "sessions", "admin_audit_entries", "outbox_events"):
        rows = await connection.fetch(
            f"SELECT to_jsonb(record)::text AS data FROM user_service.{table} record "
            "ORDER BY data"
        )
        result[table] = [row["data"] for row in rows]
    return result


async def test_upgrade_preserves_accounts_and_related_records(legacy_database) -> None:
    connection = legacy_database
    active_id, deleted_id = uuid4(), uuid4()
    await connection.execute(
        """INSERT INTO user_service.users
           (id, username, normalized_username, email, normalized_email, display_name,
            system_role, email_verified_at)
           VALUES ($1, 'ActiveUser', 'activeuser', 'active@u.nus.edu', 'active@u.nus.edu',
                   'Active User', 'SUPER_ADMIN', CURRENT_TIMESTAMP)""",
        active_id,
    )
    await connection.execute(
        """INSERT INTO user_service.users
           (id, display_name, system_role, account_status, deleted_at, role_version)
           VALUES ($1, 'Deleted User', 'ADMIN', 'DELETED', CURRENT_TIMESTAMP, 2)""",
        deleted_id,
    )
    await connection.execute(
        "INSERT INTO user_service.credentials (user_id, password_hash) VALUES ($1, $2)",
        active_id, "test-only-opaque-hash",
    )
    await connection.execute(
        """INSERT INTO user_service.sessions
           (user_id, refresh_token_hash, token_family, expires_at)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP + interval '1 day')""",
        active_id, "a" * 64, uuid4(),
    )
    await connection.execute(
        """INSERT INTO user_service.admin_audit_entries
           (actor_id, target_user_id, action, outcome, role_before, role_after, correlation_id)
           VALUES ($1, $2, 'SYSTEM_ROLE_CHANGED', 'SUCCESS', 'USER', 'ADMIN', 'migration-test')""",
        active_id, deleted_id,
    )
    await connection.execute(
        """INSERT INTO user_service.outbox_events (event_type, aggregate_id, occurred_at)
           VALUES ('user.registered.v1', $1, CURRENT_TIMESTAMP)""",
        active_id,
    )
    before = await identity_snapshot(connection)

    await connection.execute(STATUS_MIGRATION.read_text(encoding="utf-8"))

    assert await identity_snapshot(connection) == before
    assert await account_status_labels(connection) == ["ACTIVE", "DELETED"]
    assert await connection.fetchval("SELECT to_regtype('user_service.account_status_old')") is None
    assert await connection.fetchval(
        "SELECT has_type_privilege('user_service_app', 'user_service.account_status', 'USAGE')"
    )
    assert await connection.fetchval(
        """INSERT INTO user_service.users (display_name) VALUES ('Default status')
           RETURNING account_status::text"""
    ) == "ACTIVE"

    for statement in (
        "INSERT INTO user_service.users (display_name, account_status) "
        "VALUES ('Invalid status', 'SUSPENDED')",
        "UPDATE user_service.users SET account_status = 'SUSPENDED'",
    ):
        with pytest.raises(asyncpg.InvalidTextRepresentationError):
            await connection.execute(statement)
    with pytest.raises(asyncpg.CheckViolationError):
        await connection.execute(
            "UPDATE user_service.users SET account_status = 'DELETED' WHERE id = $1", active_id,
        )
    with pytest.raises(asyncpg.CheckViolationError):
        await connection.execute(
            "UPDATE user_service.users SET deleted_at = NULL WHERE id = $1", deleted_id,
        )


async def test_unexpected_suspended_account_aborts_without_changes(legacy_database) -> None:
    connection = legacy_database
    await connection.execute(
        "INSERT INTO user_service.users (display_name, account_status) "
        "VALUES ('Legacy account', 'SUSPENDED')"
    )
    before = await identity_snapshot(connection)
    with pytest.raises(asyncpg.CheckViolationError, match="suspended accounts still exist"):
        await connection.execute(STATUS_MIGRATION.read_text(encoding="utf-8"))
    await connection.execute("ROLLBACK")

    assert await identity_snapshot(connection) == before
    assert await account_status_labels(connection) == ["ACTIVE", "SUSPENDED", "DELETED"]
    assert await connection.fetchval("SELECT to_regtype('user_service.account_status_old')") is None
    assert await connection.fetchval(
        "INSERT INTO user_service.users (display_name) VALUES ('Still active by default') "
        "RETURNING account_status::text"
    ) == "ACTIVE"
    with pytest.raises(asyncpg.CheckViolationError):
        await connection.execute(
            "INSERT INTO user_service.users (display_name, account_status) "
            "VALUES ('Invalid tombstone', 'DELETED')"
        )


async def test_unexpected_enum_dependency_rolls_back_schema_changes(legacy_database) -> None:
    connection = legacy_database
    await connection.execute(
        "CREATE TABLE user_service.enum_dependency (status user_service.account_status NOT NULL); "
        "INSERT INTO user_service.enum_dependency VALUES ('ACTIVE')"
    )
    with pytest.raises(asyncpg.DependentObjectsStillExistError):
        await connection.execute(STATUS_MIGRATION.read_text(encoding="utf-8"))
    await connection.execute("ROLLBACK")

    assert await account_status_labels(connection) == ["ACTIVE", "SUSPENDED", "DELETED"]
    assert await connection.fetchval("SELECT to_regtype('user_service.account_status_old')") is None
    assert await connection.fetchval(
        "SELECT status::text FROM user_service.enum_dependency"
    ) == "ACTIVE"
    assert await connection.fetchval(
        "INSERT INTO user_service.users (display_name) VALUES ('Restored default') "
        "RETURNING account_status::text"
    ) == "ACTIVE"
    with pytest.raises(asyncpg.CheckViolationError):
        await connection.execute(
            "INSERT INTO user_service.users (display_name, account_status) "
            "VALUES ('Invalid tombstone', 'DELETED')"
        )
