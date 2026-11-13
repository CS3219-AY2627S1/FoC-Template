# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-28 to 2026-09-29
# Scope: Learning support; Boilerplate generation; Writing implementation code — configure isolated Alembic fixtures and per-test transaction rollback.
# Author review: Keith confirmed review of all affected changes.
# Details: ../../ai/usage-log.md; ai-20260929-001

import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, create_engine
from sqlalchemy.engine import Connection, URL, make_url
from sqlalchemy.exc import ArgumentError

@pytest.fixture(scope="session")
def test_database_url() -> URL:
    raw_url = os.environ.get("TEST_DATABASE_URL")

    if not raw_url or not raw_url.strip():
        pytest.fail("TEST_DATABASE_URL must be explicitly configured", pytrace=False)

    try:
        url = make_url(raw_url)
    except ArgumentError:
        pytest.fail("TEST_DATABASE_URL is not a valid database URL", pytrace=False)

    if url.drivername != "postgresql+psycopg":
        pytest.fail("TEST_DATABASE_URL must use postgresql+psycopg", pytrace=False)

    if not url.database or not url.database.endswith("_test"):
        pytest.fail("url.database should exist and end in '_test'")

    development_url = os.environ.get("DATABASE_URL")
    if development_url:
        try:
            development_database = make_url(development_url).database
        except ArgumentError:
            pytest.fail(
                "Cannot validate database isolation: DATABASE_URL is invalid",
                pytrace=False,
            )

        if url.database == development_database:
            pytest.fail("url.database should not be the same as development_database")

    return url

@pytest.fixture(scope="session")
def test_engine(test_database_url: URL) -> Iterator[Engine]:
    engine = create_engine(test_database_url, pool_pre_ping=True)

    try:
        yield engine
    finally:
        engine.dispose()

@pytest.fixture
def migrated_engine(
    test_database_url: URL,
    test_engine: Engine,
    monkeypatch: pytest.MonkeyPatch,
) -> Engine:
    # Temporarily set DATABASE_URL to the validated test URL
    monkeypatch.setenv("DATABASE_URL", test_database_url.render_as_string(hide_password=False))
    # Set USER_SERVICE_URL to a valid dummy HTTPS URL
    monkeypatch.setenv("USER_SERVICE_URL", "https://localhost:8000")

    # Locate supplier-service/alembic.ini relative to this file
    config_path = Path(__file__).resolve().parents[2] / 'alembic.ini'

    # Construct an Alembic Config using that path.
    config = Config(str(config_path))

    # Upgrade the test database to head.
    command.upgrade(config, "head")

    return test_engine


@pytest.fixture
def db_connection(migrated_engine: Engine) -> Iterator[Connection]:
    """Roll back successful writes as well as rejected inserts after each test."""
    with migrated_engine.connect() as connection:
        transaction = connection.begin()
        try:
            yield connection
        finally:
            transaction.rollback()
