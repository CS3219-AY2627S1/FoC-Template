# AI Assistance Disclosure:
# Tool: Claude Code (model: claude-sonnet-5-5, then claude-opus-5-5), date: 2026-11-04
# Scope: Writing implementation code; Debugging assistance — write PostgreSQL schema tests (structure, constraints, partial index predicate, autogenerate drift, JSON, long text, time zones, naive-datetime rejection, downgrade/upgrade); fix test bugs found while running them; split the varchar(64) tests, catch DataError, add the UTC session test, and compare the recipient_role CHECK with RECIPIENT_ROLES (ai-20261104-001).
# Author review: Keith confirmed that all tests and manual verification were completed and approved, and confirmed rerunning the tests himself, with commands and results unspecified (ai-20261104-001).
# Details: notification-service/ai/usage-log.md; ai-20261104-001

"""Schema tests against a real PostgreSQL database.

Set TEST_DATABASE_URL (postgresql+psycopg://...) to a disposable, empty
database to run them. The tests run the real ``alembic`` CLI against it,
including ``downgrade base``, so never point this at a database you care about.
"""

import os
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from psycopg import errors as pg_errors
from sqlalchemy import create_engine, text
from sqlalchemy.exc import DataError, IntegrityError, StatementError
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

from app.db import SESSION_TIME_ZONE, Base, make_engine
from app.models import RECIPIENT_ROLES, Notification, ProcessedEvent

SERVICE_ROOT = Path(__file__).resolve().parents[1]
TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not TEST_DATABASE_URL,
    reason="Set TEST_DATABASE_URL to run PostgreSQL schema tests",
)

NOW = datetime(2026, 11, 4, 12, 0, tzinfo=timezone.utc)


def run_alembic(*args: str) -> None:
    env = {**os.environ, "DATABASE_URL": TEST_DATABASE_URL}
    result = subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=SERVICE_ROOT,
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def table_names(engine) -> set[str]:
    with engine.connect() as connection:
        return set(
            connection.execute(
                text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
            ).scalars()
        )


@pytest.fixture(scope="module")
def engine():
    assert TEST_DATABASE_URL is not None
    if not TEST_DATABASE_URL.startswith("postgresql"):
        pytest.fail("TEST_DATABASE_URL must point to PostgreSQL")
    engine = make_engine(TEST_DATABASE_URL)
    unexpected = table_names(engine) - {"alembic_version", "notifications", "processed_events"}
    if unexpected:
        engine.dispose()
        pytest.fail(
            f"TEST_DATABASE_URL is not a disposable database; found {sorted(unexpected)}"
        )
    run_alembic("downgrade", "base")
    run_alembic("upgrade", "head")
    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture
def session(engine):
    with Session(engine) as session:
        yield session
    with engine.begin() as connection:
        connection.execute(text("DELETE FROM notifications"))
        connection.execute(text("DELETE FROM processed_events"))


def make_notification(**overrides) -> Notification:
    values = dict(
        recipient_id=uuid4(),
        recipient_role="requester",
        event_id=uuid4(),
        order_id=uuid4(),
        type="order.accepted",
        title="Order accepted",
        body="A courier accepted your order.",
        occurred_at=NOW,
    )
    values.update(overrides)
    return Notification(**values)


def table_columns(engine, table: str) -> dict[str, tuple]:
    query = text(
        """
        SELECT column_name, data_type, character_maximum_length, is_nullable,
               column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = :table
        """
    )
    with engine.connect() as connection:
        rows = connection.execute(query, {"table": table}).all()
    return {r[0]: (r[1], r[2], r[3], r[4]) for r in rows}


def index_defs(engine, table: str) -> dict[str, str]:
    query = text(
        "SELECT indexname, indexdef FROM pg_indexes "
        "WHERE schemaname = 'public' AND tablename = :table"
    )
    with engine.connect() as connection:
        return dict(connection.execute(query, {"table": table}).all())


# --- Structure -------------------------------------------------------------


def test_processed_events_columns(engine):
    assert table_columns(engine, "processed_events") == {
        "event_id": ("uuid", None, "NO", None),
        "event_type": ("character varying", 64, "NO", None),
        "processed_at": ("timestamp with time zone", None, "NO", None),
    }


def test_notifications_columns(engine):
    columns = table_columns(engine, "notifications")
    id_default = columns["id"][3]
    assert id_default is not None and id_default.startswith("nextval(")
    columns["id"] = columns["id"][:3] + (None,)
    assert columns == {
        "id": ("bigint", None, "NO", None),
        "recipient_id": ("uuid", None, "NO", None),
        "recipient_role": ("character varying", 16, "NO", None),
        "event_id": ("uuid", None, "NO", None),
        "order_id": ("uuid", None, "NO", None),
        "type": ("character varying", 64, "NO", None),
        "params": ("jsonb", None, "NO", "'{}'::jsonb"),
        "title": ("text", None, "NO", None),
        "body": ("text", None, "NO", None),
        "occurred_at": ("timestamp with time zone", None, "NO", None),
        "created_at": ("timestamp with time zone", None, "NO", "now()"),
        "read_at": ("timestamp with time zone", None, "YES", None),
    }


def test_primary_keys_and_no_foreign_keys(engine):
    query = text(
        """
        SELECT conrelid::regclass::text, contype, pg_get_constraintdef(oid)
        FROM pg_constraint WHERE connamespace = 'public'::regnamespace
        """
    )
    with engine.connect() as connection:
        constraints = {tuple(row) for row in connection.execute(query).all()}
    assert ("processed_events", "p", "PRIMARY KEY (event_id)") in constraints
    assert ("notifications", "p", "PRIMARY KEY (id)") in constraints
    assert (
        "notifications",
        "u",
        "UNIQUE (event_id, recipient_id)",
    ) in constraints
    assert not [c for c in constraints if c[1] == "f"]


def test_recipient_and_unread_indexes(engine):
    indexes = index_defs(engine, "notifications")
    assert (
        "(recipient_id, id DESC)" in indexes["ix_notifications_recipient_id_desc"]
    )
    unread = indexes["ix_notifications_recipient_unread"]
    assert "(recipient_id)" in unread
    assert unread.endswith("WHERE (read_at IS NULL)")
    # Primary key, unique constraint, and the two named indexes; nothing else.
    assert len(indexes) == 4


def test_partial_index_predicate_is_exactly_read_at_is_null(engine):
    query = text(
        """
        SELECT pg_get_expr(i.indpred, i.indrelid)
        FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
        WHERE c.relname = 'ix_notifications_recipient_unread'
        """
    )
    with engine.connect() as connection:
        assert connection.execute(query).scalar_one() == "(read_at IS NULL)"


def test_models_match_migration_with_no_autogenerate_changes(engine):
    with engine.connect() as connection:
        context = MigrationContext.configure(
            connection,
            opts={"compare_type": True, "compare_server_default": True},
        )
        assert compare_metadata(context, Base.metadata) == []


# --- Constraints -----------------------------------------------------------


def test_duplicate_event_and_recipient_is_unique_violation(session):
    event_id, recipient_id = uuid4(), uuid4()
    session.add(make_notification(event_id=event_id, recipient_id=recipient_id))
    session.commit()
    session.add(make_notification(event_id=event_id, recipient_id=recipient_id))
    with pytest.raises(IntegrityError) as excinfo:
        session.commit()
    assert isinstance(excinfo.value.orig, pg_errors.UniqueViolation)


def test_same_event_with_different_recipient_succeeds(session):
    event_id = uuid4()
    session.add(make_notification(event_id=event_id))
    session.add(make_notification(event_id=event_id, recipient_role="courier"))
    session.commit()
    count = session.execute(
        text("SELECT count(*) FROM notifications WHERE event_id = :e"),
        {"e": event_id},
    ).scalar_one()
    assert count == 2


def test_duplicate_processed_event_is_unique_violation(session):
    event_id = uuid4()
    session.add(
        ProcessedEvent(event_id=event_id, event_type="order.accepted", processed_at=NOW)
    )
    session.commit()
    session.add(
        ProcessedEvent(event_id=event_id, event_type="order.accepted", processed_at=NOW)
    )
    with pytest.raises(IntegrityError) as excinfo:
        session.commit()
    assert isinstance(excinfo.value.orig, pg_errors.UniqueViolation)


def test_recipient_role_check_matches_model_constant(engine):
    # Alembic autogenerate does not compare CHECK constraints, so a role added
    # to or removed from RECIPIENT_ROLES without a migration is caught here.
    query = text(
        "SELECT pg_get_constraintdef(oid) FROM pg_constraint "
        "WHERE conname = 'ck_notifications_recipient_role'"
    )
    with engine.connect() as connection:
        definition = connection.execute(query).scalar_one()
    database_roles = re.findall(r"'([^']*)'::character varying", definition)
    assert sorted(database_roles) == sorted(RECIPIENT_ROLES), definition


@pytest.mark.parametrize("role", RECIPIENT_ROLES)
def test_allowed_recipient_roles(session, role):
    session.add(make_notification(recipient_role=role))
    session.commit()


@pytest.mark.parametrize("role", ["admin", "Requester", "COURIER", "", " courier"])
def test_other_recipient_roles_are_rejected(session, role):
    session.add(make_notification(recipient_role=role))
    with pytest.raises(IntegrityError) as excinfo:
        session.commit()
    assert isinstance(excinfo.value.orig, pg_errors.CheckViolation)


def test_null_recipient_role_is_rejected(session):
    session.add(make_notification(recipient_role=None))
    with pytest.raises(IntegrityError) as excinfo:
        session.commit()
    assert isinstance(excinfo.value.orig, pg_errors.NotNullViolation)


def test_notification_has_no_foreign_key_on_recipient(session):
    # recipient_id is an arbitrary User Service ID with no local users table.
    session.add(make_notification(recipient_id=uuid4()))
    session.commit()


def make_processed_event(event_type: str) -> ProcessedEvent:
    return ProcessedEvent(event_id=uuid4(), event_type=event_type, processed_at=NOW)


def make_notification_of_type(event_type: str) -> Notification:
    return make_notification(type=event_type)


VARCHAR_64_ROWS = [
    pytest.param(make_processed_event, id="processed_events.event_type"),
    pytest.param(make_notification_of_type, id="notifications.type"),
]


@pytest.mark.parametrize("make_row", VARCHAR_64_ROWS)
def test_64_character_type_is_accepted(session, make_row):
    session.add(make_row("x" * 64))
    session.commit()


@pytest.mark.parametrize("make_row", VARCHAR_64_ROWS)
def test_65_character_type_is_rejected(session, make_row):
    session.add(make_row("x" * 65))
    with pytest.raises(DataError) as excinfo:
        session.commit()
    assert isinstance(excinfo.value.orig, pg_errors.StringDataRightTruncation)


# --- Defaults, JSON, text, and timestamps -----------------------------------


def test_defaults_params_empty_object_and_created_at(session):
    notification = make_notification()
    session.add(notification)
    session.commit()
    session.refresh(notification)
    assert notification.id is not None
    assert notification.params == {}
    assert notification.read_at is None
    assert notification.created_at.tzinfo is not None
    assert abs(datetime.now(timezone.utc) - notification.created_at) < timedelta(
        minutes=1
    )


def test_params_accepts_empty_and_nested_json(session):
    nested = {"a": {"b": [1, 2, {"c": None}], "d": "é"}, "e": [True, 1.5]}
    first = make_notification(params={})
    second = make_notification(params=nested)
    session.add_all([first, second])
    session.commit()
    session.refresh(first)
    session.refresh(second)
    assert first.params == {}
    assert second.params == nested


def test_params_cannot_be_null(session):
    with pytest.raises(IntegrityError) as excinfo:
        session.execute(
            text(
                "INSERT INTO notifications (recipient_id, recipient_role, event_id, "
                "order_id, type, params, title, body, occurred_at) VALUES "
                "(:r, 'courier', :e, :o, 't', NULL, 'a', 'b', now())"
            ),
            {"r": uuid4(), "e": uuid4(), "o": uuid4()},
        )
    assert isinstance(excinfo.value.orig, pg_errors.NotNullViolation)


def test_very_long_title_and_body_are_allowed(session):
    long_text = "x" * 1_000_000
    notification = make_notification(title=long_text, body=long_text)
    session.add(notification)
    session.commit()
    session.refresh(notification)
    assert len(notification.title) == 1_000_000
    assert len(notification.body) == 1_000_000


def test_timestamps_round_trip_with_timezone(session):
    sgt = timezone(timedelta(hours=8))
    occurred = datetime(2026, 11, 4, 20, 0, tzinfo=sgt)
    notification = make_notification(occurred_at=occurred, read_at=occurred)
    session.add(notification)
    session.add(
        ProcessedEvent(event_id=uuid4(), event_type="order.accepted", processed_at=occurred)
    )
    session.commit()
    session.refresh(notification)
    assert notification.occurred_at.tzinfo is not None
    assert notification.occurred_at == occurred  # same instant
    assert notification.occurred_at.utcoffset() is not None
    assert notification.read_at == occurred
    processed = session.execute(text("SELECT processed_at FROM processed_events")).scalar_one()
    assert processed.tzinfo is not None and processed == occurred


@pytest.mark.parametrize("column", ["occurred_at", "created_at", "read_at"])
def test_naive_datetime_is_rejected_not_stored_as_local_time(session, column):
    naive = datetime(2026, 11, 4, 12, 0)
    session.add(make_notification(**{column: naive}))
    with pytest.raises(StatementError) as excinfo:
        session.commit()
    assert isinstance(excinfo.value.orig, ValueError)
    session.rollback()
    assert session.execute(text("SELECT count(*) FROM notifications")).scalar_one() == 0


def test_naive_processed_at_is_rejected(session):
    session.add(
        ProcessedEvent(
            event_id=uuid4(),
            event_type="order.accepted",
            processed_at=datetime(2026, 11, 4, 12, 0),
        )
    )
    with pytest.raises(StatementError) as excinfo:
        session.commit()
    assert isinstance(excinfo.value.orig, ValueError)


def set_database_time_zone(engine, clause: str) -> None:
    """Run ALTER DATABASE <current database> <clause> (SET or RESET timezone)."""

    with engine.begin() as connection:
        name = connection.execute(text("SELECT current_database()")).scalar_one()
        quoted = connection.dialect.identifier_preparer.quote(name)
        connection.execute(text(f"ALTER DATABASE {quoted} {clause}"))


# The engine fixture is required for its disposable-database safeguard, which
# must run before this test alters the database.
@pytest.mark.usefixtures("engine")
def test_session_time_zone_is_utc_even_when_server_default_differs():
    # A naive value sent with raw SQL bypasses TimestampTZ. The app engine pins
    # the session time zone, so PostgreSQL must still read it as UTC.
    # ALTER DATABASE SET only affects new sessions, so do not pool connections.
    plain = create_engine(TEST_DATABASE_URL, poolclass=NullPool)
    set_database_time_zone(plain, "SET timezone = 'Asia/Singapore'")
    try:
        with plain.connect() as connection:
            # Without the pin, a new connection uses the database setting.
            assert connection.execute(text("SHOW timezone")).scalar_one() == (
                "Asia/Singapore"
            )
        pinned = make_engine(TEST_DATABASE_URL)
        try:
            with pinned.connect() as connection:
                assert connection.execute(text("SHOW timezone")).scalar_one() == (
                    SESSION_TIME_ZONE
                )
                value = connection.execute(
                    text("SELECT CAST('2026-11-04 12:00:00' AS timestamptz)")
                ).scalar_one()
            assert value == datetime(2026, 11, 4, 12, 0, tzinfo=timezone.utc)
        finally:
            pinned.dispose()
    finally:
        set_database_time_zone(plain, "RESET timezone")
        plain.dispose()


# --- Migration lifecycle ----------------------------------------------------


def test_downgrade_base_removes_tables_and_upgrade_head_succeeds_again(engine):
    run_alembic("downgrade", "base")
    tables = table_names(engine)
    assert "notifications" not in tables
    assert "processed_events" not in tables
    run_alembic("upgrade", "head")
    assert {"notifications", "processed_events"} <= table_names(engine)
