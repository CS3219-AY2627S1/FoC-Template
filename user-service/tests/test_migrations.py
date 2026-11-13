"""Regression tests for fresh and pre-Alembic database migrations."""

import importlib.util
import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest


SERVICE_DIR = Path(__file__).resolve().parents[1]
BASELINE_MIGRATION = (
    SERVICE_DIR / "alembic" / "versions" / "20260924_0001_baseline_users.py"
)


def load_baseline_migration():
    """Load the baseline revision so its dialect-neutral validator can be tested."""

    spec = importlib.util.spec_from_file_location(
        "baseline_migration", BASELINE_MIGRATION
    )
    assert spec and spec.loader
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    return migration


def run_alembic_upgrade(database_url: str) -> subprocess.CompletedProcess[str]:
    """Run the same Alembic command used by the deployment migration job."""

    environment = os.environ.copy()
    environment["DATABASE_URL"] = database_url
    return subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=SERVICE_DIR,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )


def structured_logs(result: subprocess.CompletedProcess[str]) -> list[dict[str, object]]:
    """Decode the one-JSON-record-per-line migration stdout contract."""

    return [json.loads(line) for line in result.stdout.splitlines() if line.strip()]


def test_alembic_requires_database_url():
    """Migrations fail instead of silently targeting a fallback database."""

    environment = os.environ.copy()
    environment.pop("DATABASE_URL", None)
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=SERVICE_DIR,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode != 0
    assert "DATABASE_URL must be set" in result.stdout + result.stderr
    records = structured_logs(result)
    assert [record["event"] for record in records] == [
        "migration_started",
        "migration_failed",
    ]
    assert all(record["component"] == "migration" for record in records)


def test_application_requires_database_url():
    """The application fails instead of silently selecting SQLite."""

    environment = os.environ.copy()
    environment.pop("DATABASE_URL", None)
    result = subprocess.run(
        [sys.executable, "-c", "import app.db"],
        cwd=SERVICE_DIR,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode != 0
    assert "DATABASE_URL must be set before starting the User Service" in result.stderr


def test_fresh_database_reaches_migration_head(tmp_path):
    """A new database receives both application tables and the version row."""

    database_path = tmp_path / "fresh.db"
    result = run_alembic_upgrade(f"sqlite:///{database_path}")

    assert result.returncode == 0, result.stderr
    records = structured_logs(result)
    assert [record["event"] for record in records] == [
        "migration_started",
        "migration_completed",
    ]
    with sqlite3.connect(database_path) as database:
        tables = {
            row[0]
            for row in database.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        version = database.execute("SELECT version_num FROM alembic_version").fetchone()[0]

    assert {
        "users",
        "user_sessions",
        "admin_state_locks",
        "alembic_version",
    } <= tables
    assert "user_outbox_events" not in tables
    assert version == "20261020_0007"


def test_check_constraint_validation_accepts_postgresql_rendering():
    """Equivalent PostgreSQL check SQL is accepted by the legacy validator."""

    migration = load_baseline_migration()

    assert migration._check_constraint_matches(
        "((role)::text = ANY ((ARRAY['user'::character varying, "
        "'admin'::character varying])::text[]))",
        "role",
        {"user", "admin"},
    )


def test_legacy_create_all_database_is_adopted_without_data_loss(tmp_path):
    """A database created by the previous startup path can be upgraded safely."""

    database_path = tmp_path / "legacy.db"
    database_url = f"sqlite:///{database_path}"
    environment = os.environ.copy()
    environment["DATABASE_URL"] = database_url
    setup = subprocess.run(
        [
            sys.executable,
            "-c",
            """
from app.db import Base, engine
from app.models import User
from sqlalchemy.orm import Session

Base.metadata.create_all(engine)
with Session(engine) as database:
    database.add(User(
        nus_student_number="A0123456X",
        email="student@example.com",
        display_name="Student",
        password_hash="legacy-hash",
    ))
    database.commit()
""",
        ],
        cwd=SERVICE_DIR,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    assert setup.returncode == 0, setup.stderr

    result = run_alembic_upgrade(database_url)

    assert result.returncode == 0, result.stderr
    with sqlite3.connect(database_path) as database:
        version = database.execute("SELECT version_num FROM alembic_version").fetchone()[0]
        user_count = database.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        lock_name = database.execute(
            "SELECT lock_name FROM admin_state_locks"
        ).fetchone()[0]

    assert version == "20261020_0007"
    assert user_count == 1
    assert lock_name == "administrator_state"


def test_incompatible_legacy_schema_is_rejected(tmp_path):
    """A same-named but incompatible table is not silently stamped as valid."""

    database_path = tmp_path / "incompatible.db"
    with sqlite3.connect(database_path) as database:
        database.execute("CREATE TABLE users (id TEXT PRIMARY KEY)")
        database.commit()

    result = run_alembic_upgrade(f"sqlite:///{database_path}")

    assert result.returncode != 0
    assert "does not match the expected legacy schema" in (
        result.stdout + result.stderr
    )


@pytest.mark.parametrize(
    ("student_number_type", "email_type"),
    [("VARCHAR(8)", "VARCHAR(254)"), ("VARCHAR(9)", "TEXT")],
)
def test_legacy_schema_with_incompatible_types_or_lengths_is_rejected(
    tmp_path, student_number_type, email_type
):
    """A same-named table with incorrect field definitions is not adopted."""

    database_path = tmp_path / "incompatible-fields.db"
    with sqlite3.connect(database_path) as database:
        database.executescript(
            f"""
            CREATE TABLE users (
                id CHAR(32) NOT NULL PRIMARY KEY,
                nus_student_number {student_number_type} NOT NULL,
                email {email_type} NOT NULL,
                display_name VARCHAR(100) NOT NULL,
                password_hash VARCHAR(254) NOT NULL,
                role VARCHAR(20) NOT NULL DEFAULT 'user',
                status VARCHAR(20) NOT NULL DEFAULT 'active',
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                CONSTRAINT ck_users_role CHECK (role IN ('user', 'admin')),
                CONSTRAINT ck_users_status CHECK (
                    status IN ('active', 'deactivated', 'suspended')
                )
            );
            CREATE UNIQUE INDEX ix_users_nus_student_number
                ON users (nus_student_number);
            CREATE UNIQUE INDEX ix_users_email ON users (email);
            """
        )

    result = run_alembic_upgrade(f"sqlite:///{database_path}")

    assert result.returncode != 0
    output = result.stdout + result.stderr
    assert "unexpected type or length" in output
