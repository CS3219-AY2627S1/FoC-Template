# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-28 to 2026-09-29
# Scope: Learning support; Writing implementation code; Debugging assistance — test schema rules, indexes, category data, concurrency, role permissions, drift, and downgrade/re-upgrade behavior.
# Author review: Keith confirmed review of all affected changes.
# Details: ../../ai/usage-log.md; ai-20260929-001

import os
from concurrent.futures import ThreadPoolExecutor
from datetime import time
from pathlib import Path
from threading import Barrier
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from sqlalchemy import Engine, create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError, ProgrammingError

def test_migrations_create_application_tables(migrated_engine: Engine) -> None:
    # Create a SQLAlchemy inspector for migrated_engine
    inspector = inspect(migrated_engine)
    # Obtain the table names in the public schema
    actual_tables = set(inspector.get_table_names(schema="public"))
    # Assert that all three application tables are present
    expected_tables = {"category", "supplier", "supplier_category"}

    assert expected_tables <= actual_tables

def test_migration_revision_is_recorded(migrated_engine: Engine) -> None:
    # Open a connection using migrated_engine.connect()
    with migrated_engine.connect() as connection:
        # Create a MigrationContext for that connection
        migration_context = MigrationContext.configure(connection)
        # Assert that the current revision is "0002"
        assert migration_context.get_current_revision() == "0002"

@pytest.mark.parametrize("name", ["", "   ", "\t\n"])
def test_category_rejects_blank_names(
    migrated_engine: Engine,
    name: str,
) -> None:
    with pytest.raises(IntegrityError) as exc_info:
        with migrated_engine.begin() as connection:
            # Execute a parameterized INSERT into category with a UUID and name
            connection.execute(
                text("INSERT INTO category (id, name) VALUES (:id, :name)"),
                {"id": uuid4(), "name": name}
            )
    assert exc_info.value.orig.diag.constraint_name == "ck_category_name_nonblank"


def insert_supplier(connection, **overrides):
    values = dict(
        id=uuid4(), name=f"Supplier {uuid4()}", area="Science",
        longitude=103.77, latitude=1.30, version=1,
        opening_time=None, closing_time=None, closing_day_offset=None,
    )
    values.update(overrides)
    connection.execute(text("""
        INSERT INTO supplier
            (id, name, area, location, version, created_at, updated_at,
             opening_time, closing_time, closing_day_offset)
        VALUES (:id, :name, :area,
                ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography,
                :version, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
                :opening_time, :closing_time, :closing_day_offset)
    """), values)
    return values["id"]


def test_category_rejects_case_insensitive_duplicates(db_connection):
    name = f"category-{uuid4()}"
    statement = text("INSERT INTO category (id, name) VALUES (:id, :name)")
    db_connection.execute(statement, {"id": uuid4(), "name": name})
    with pytest.raises(IntegrityError) as error:
        with db_connection.begin_nested():
            db_connection.execute(statement, {"id": uuid4(), "name": name.upper()})
    assert error.value.orig.diag.constraint_name == "uq_category_name_ci"


@pytest.mark.parametrize("name", ["", "   ", "\t\n"])
def test_supplier_rejects_blank_names(db_connection, name):
    with pytest.raises(IntegrityError) as error:
        with db_connection.begin_nested():
            insert_supplier(db_connection, name=name)
    assert error.value.orig.diag.constraint_name == "ck_supplier_name_nonblank"


@pytest.mark.parametrize("version", [0, -1])
def test_supplier_rejects_nonpositive_version(db_connection, version):
    with pytest.raises(IntegrityError) as error:
        with db_connection.begin_nested():
            insert_supplier(db_connection, version=version)
    assert error.value.orig.diag.constraint_name == "ck_supplier_version_positive"


@pytest.mark.parametrize("opening,closing,offset,valid", [
    (None, None, None, True),
    ("09:00", None, None, False), (None, "17:00", None, False),
    (None, None, 0, False), ("09:00", "17:00", None, False),
    ("09:00", None, 0, False), (None, "17:00", 0, False),
    ("09:00", "17:00", 0, True), ("22:00", "02:00", 1, True),
    ("09:00", "09:00", 1, True), ("09:00", "09:00", 0, False),
    ("09:00", "17:00", 1, False), ("22:00", "02:00", 0, False),
    ("09:00", "17:00", -1, False), ("09:00", "17:00", 2, False),
])
def test_hours(db_connection, opening, closing, offset, valid):
    values = dict(opening_time=time.fromisoformat(opening) if opening else None,
                  closing_time=time.fromisoformat(closing) if closing else None,
                  closing_day_offset=offset)
    if valid:
        insert_supplier(db_connection, **values)
    else:
        with pytest.raises(IntegrityError) as error:
            with db_connection.begin_nested():
                insert_supplier(db_connection, **values)
        assert error.value.orig.diag.constraint_name == "ck_supplier_opening_hours"


def test_assignment_keys_and_restricted_deletion(db_connection):
    supplier_id = insert_supplier(db_connection)
    category_id = uuid4()
    db_connection.execute(text("INSERT INTO category VALUES (:id, :name)"),
                          {"id": category_id, "name": f"category-{uuid4()}"})
    insert = text("INSERT INTO supplier_category VALUES (:supplier, :category)")
    params = {"supplier": supplier_id, "category": category_id}
    db_connection.execute(insert, params)
    for statement, values, sqlstate in [
        (insert, params, "23505"),
        (insert, {**params, "supplier": uuid4()}, "23503"),
        (insert, {**params, "category": uuid4()}, "23503"),
        (text("DELETE FROM category WHERE id=:category"), params, "23503"),
    ]:
        with pytest.raises(IntegrityError) as error:
            with db_connection.begin_nested():
                db_connection.execute(statement, values)
        assert error.value.orig.sqlstate == sqlstate


def test_active_identity_and_coordinate_order(db_connection):
    name = f"Place {uuid4()}"
    first = insert_supplier(db_connection, name=name)
    coords = db_connection.execute(text(
        "SELECT ST_X(location::geometry), ST_Y(location::geometry) FROM supplier WHERE id=:id"
    ), {"id": first}).one()
    assert tuple(coords) == (103.77, 1.30)
    with pytest.raises(IntegrityError) as error:
        with db_connection.begin_nested():
            insert_supplier(db_connection, name=f"  {name.upper()}  ", area="Other")
    assert error.value.orig.diag.constraint_name == "uq_supplier_active_name_location"
    insert_supplier(db_connection, name=name, longitude=103.77000001)
    insert_supplier(db_connection, name=name, latitude=1.30000001)
    db_connection.execute(text("UPDATE supplier SET deleted_at=now() WHERE id=:id"), {"id": first})
    replacement = insert_supplier(db_connection, name=name)
    assert replacement != first
    with pytest.raises(IntegrityError):
        with db_connection.begin_nested():
            db_connection.execute(text("UPDATE supplier SET deleted_at=NULL WHERE id=:id"), {"id": first})


def test_index_definitions(db_connection):
    indexes = dict(db_connection.execute(text("""
        SELECT indexname, indexdef FROM pg_indexes
        WHERE schemaname='public' AND tablename IN ('supplier', 'category', 'supplier_category')
    """)).all())
    expected = {
        "uq_category_name_ci", "ix_supplier_active_area_name", "ix_supplier_active_name",
        "ix_supplier_location", "uq_supplier_active_name_location",
        "ix_supplier_category_category_supplier",
    }
    assert expected <= indexes.keys()
    assert sum("USING gist" in definition for definition in indexes.values()) == 1
    for name in ("ix_supplier_active_area_name", "ix_supplier_active_name", "uq_supplier_active_name_location"):
        assert "WHERE (deleted_at IS NULL)" in indexes[name]
    assert "(area, name, id)" in indexes["ix_supplier_active_area_name"]
    assert "(name, id)" in indexes["ix_supplier_active_name"]
    assert "(category_id, supplier_id)" in indexes["ix_supplier_category_category_supplier"]


def test_controlled_categories(db_connection):
    rows = dict(db_connection.execute(text("SELECT name, id::text FROM category")).all())
    assert rows == {
        "Food": "90909a88-65cc-4150-8b71-abc339d0c033",
        "Coffee": "92f0136e-5617-4380-9367-b2991ceda339",
        "Shopping": "e80d50ef-3a8a-43d7-a39e-6a4beb42ea22",
        "Printing": "419a5b1b-bb4c-4869-a9a3-9b5b1793add2",
    }


def test_concurrent_duplicates_cannot_both_commit(migrated_engine):

    name = f"Concurrent {uuid4()}"
    barrier = Barrier(2)

    def insert():
        try:
            with migrated_engine.begin() as connection:
                connection.execute(text("SET LOCAL statement_timeout = '10s'"))
                barrier.wait(timeout=10)
                insert_supplier(connection, name=name)
            return "committed"
        except IntegrityError as error:
            assert error.orig.diag.constraint_name == "uq_supplier_active_name_location"
            return "duplicate"

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(lambda _: insert(), range(2)))
        assert sorted(results) == ["committed", "duplicate"]
    finally:
        with migrated_engine.begin() as connection:
            connection.execute(text("DELETE FROM supplier WHERE name=:name"), {"name": name})


def test_metadata_matches_migrations(migrated_engine):

    command.check(Config(str(Path(__file__).resolve().parents[2] / "alembic.ini")))


def test_runtime_permissions(migrated_engine):

    url = os.environ.get("TEST_RUNTIME_DATABASE_URL")
    if not url:
        pytest.skip("Set TEST_RUNTIME_DATABASE_URL after applying runtime-grants.sql")
    runtime_url = make_url(url)
    migration_url = migrated_engine.url
    assert (runtime_url.host, runtime_url.port, runtime_url.database) == (
        migration_url.host, migration_url.port, migration_url.database
    ), "Runtime tests must target the same disposable database as migration tests"
    assert runtime_url.username == "supplier_runtime"
    engine = create_engine(runtime_url)
    try:
        with engine.connect() as connection:
            transaction = connection.begin()
            try:
                supplier_id = insert_supplier(connection)
                category_id = connection.execute(text("SELECT id FROM category LIMIT 1")).scalar_one()
                connection.execute(text("INSERT INTO supplier_category VALUES (:s, :c)"),
                                   {"s": supplier_id, "c": category_id})
                connection.execute(text("UPDATE supplier SET version=2 WHERE id=:id"), {"id": supplier_id})
                connection.execute(text("DELETE FROM supplier_category WHERE supplier_id=:id"), {"id": supplier_id})
                connection.execute(text("DELETE FROM supplier WHERE id=:id"), {"id": supplier_id})
                connection.execute(text("SELECT version_num FROM alembic_version"))
                for sql in [
                    "CREATE TABLE public.forbidden_table (id integer)",
                    "CREATE TEMP TABLE forbidden_temp (id integer)",
                    "UPDATE category SET name=name",
                    "DELETE FROM category WHERE false",
                    "UPDATE alembic_version SET version_num=version_num",
                    "ALTER TABLE supplier ADD COLUMN forbidden integer",
                ]:
                    with pytest.raises(ProgrammingError) as error:
                        with connection.begin_nested():
                            connection.execute(text(sql))
                    assert error.value.orig.sqlstate == "42501"
            finally:
                transaction.rollback()
    finally:
        engine.dispose()


def test_downgrade_round_trip(test_database_url, monkeypatch):
    """Create and destroy only a new, uniquely named database owned by this test."""

    admin_url = os.environ.get("TEST_ADMIN_DATABASE_URL")
    if not admin_url:
        pytest.skip("Set TEST_ADMIN_DATABASE_URL to enable isolated database lifecycle checks")
    name = f"supplier_migration_{uuid4().hex}_test"
    admin = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    target = admin.url.set(database=name)
    engine = create_engine(target)
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    created = False
    try:
        with admin.connect() as connection:
            connection.execute(text(f'CREATE DATABASE "{name}"'))
        created = True
        monkeypatch.setenv("DATABASE_URL", target.render_as_string(hide_password=False))
        monkeypatch.setenv("USER_SERVICE_URL", "https://localhost:8000")
        command.upgrade(config, "head")
        with engine.connect() as connection:
            original = connection.execute(text("SELECT id, name FROM category ORDER BY name")).all()
        # A category assignment must prevent the seed downgrade.
        with engine.begin() as connection:
            supplier_id = insert_supplier(connection)
            connection.execute(text("INSERT INTO supplier_category VALUES (:s, :c)"),
                               {"s": supplier_id, "c": original[0].id})
        with pytest.raises(IntegrityError):
            command.downgrade(config, "0001")
        with engine.begin() as connection:
            assert MigrationContext.configure(connection).get_current_revision() == "0002"
            connection.execute(text("DELETE FROM supplier_category"))
        command.downgrade(config, "0001")
        with engine.connect() as connection:
            assert connection.execute(text("SELECT count(*) FROM category")).scalar_one() == 0
        command.upgrade(config, "head")
        with engine.connect() as connection:
            assert connection.execute(text("SELECT id, name FROM category ORDER BY name")).all() == original
        command.downgrade(config, "base")
        with engine.connect() as connection:
            assert not {"supplier", "category", "supplier_category"} & set(inspect(connection).get_table_names())
            assert connection.execute(text("SELECT count(*) FROM pg_extension WHERE extname='postgis'")).scalar_one() == 1
        command.upgrade(config, "head")
        command.check(config)
    finally:
        engine.dispose()
        if created:
            with admin.connect() as connection:
                connection.execute(text(f'DROP DATABASE "{name}"'))
        admin.dispose()
