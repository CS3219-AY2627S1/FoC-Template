"""Smoke test for the migration path against PostgreSQL."""

import os
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text


SERVICE_DIR = Path(__file__).resolve().parents[1]
TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not TEST_DATABASE_URL,
    reason="Set TEST_DATABASE_URL to run PostgreSQL migration smoke tests",
)


def test_fresh_postgres_database_reaches_migration_head():
    """A fresh PostgreSQL database receives the complete migration schema."""

    assert TEST_DATABASE_URL is not None
    if not TEST_DATABASE_URL.startswith("postgresql"):
        pytest.fail("TEST_DATABASE_URL must point to PostgreSQL")

    environment = os.environ.copy()
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=SERVICE_DIR,
        env={**environment, "DATABASE_URL": TEST_DATABASE_URL},
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr

    engine = create_engine(TEST_DATABASE_URL)
    try:
        tables = set(inspect(engine).get_table_names())
        with engine.connect() as connection:
            version = connection.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar_one()
    finally:
        engine.dispose()

    assert {"users", "user_sessions", "admin_state_locks", "alembic_version"} <= tables
    assert "user_outbox_events" not in tables
    assert version == "20261020_0007"
