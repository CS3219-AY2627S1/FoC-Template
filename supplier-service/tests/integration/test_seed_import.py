# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-30
# Scope: Writing implementation code — test classification against isolated migrated PostgreSQL/PostGIS, including edited/deleted identities, exact coordinate conflicts, category resolution, duplicate policies, aggregate issues, and unchanged database and pending caller state.
# Scope: Writing implementation code — add 13 atomic import cases using disposable migrated databases, real-source repeatability, administrator-edit and deletion preservation, invalid-input rejection, classification and assignment rollback, pre-commit failure, and explicitly synchronized independent-connection import/API races with cleanup.
# Scope: Writing implementation code — add subprocess CLI tests for preview/import/rerun, schema mismatch, identity and duplicate decisions, malformed source, connectivity failures, rollback, database-enforced read-only behavior, and reclassification after preview. (ai-20260930-011, Prompt 1)
# Scope: Writing implementation code — guard credential-leak assertions for absent/empty passwords and test optional passwords while retaining rejection of configured passwords in stdout or stderr. (ai-20260930-011, Prompt 2)
# Scope: Writing implementation code; Debugging assistance — simulate successful database commit followed by lost acknowledgement through importer and CLI, verify safe output and idempotent reconciliation, update conservative commit-stage expectations, and test confirmed rollback before commit. (ai-20260930-011, Prompt 3)
# Scope: Writing implementation code — add direct seed/create insertion coverage for scalar persistence, bound geography, initial state, separate assignments, and caller-owned rollback. (ai-20261001-001)
# Author review: Keith confirmed review of earlier work (ai-20260930-009; ai-20260930-010). Keith also confirmed review of all affected changes under ai-20260930-011 (Prompts 1–3).
# Author review: Keith confirmed review of all affected changes (ai-20261001-001)
# Tool: Codex (model: GPT-6), date: 2026-10-01
# Scope: Writing implementation code; Boilerplate generation — seed a real batch, edit and delete through mounted routes, reimport, and verify complete retained deleted identity, assignments, timestamps, version, administrator visibility, and lock release. (ai-20261001-013)
# Author review: Keith confirmed review of the retained lifecycle tests (ai-20261001-013).
# Details: ../../ai/usage-log.md; ai-20260930-009; ai-20260930-010; ai-20260930-011; ai-20261001-001; ai-20261001-013

"""Classification and atomic imports on migrated PostgreSQL/PostGIS databases."""
from dataclasses import replace
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import pytest
from geoalchemy2.elements import WKTElement
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.commands.seed_parsing import parse_seed_source
from app.models import Category, Supplier
from app.services.seed_import import classify_seed_records

from tests.integration.test_supplier_creates import ADMIN_HEADERS, create_engine_db, post_client
from tests.integration.test_supplier_updates import patch_client, patch_supplier


@pytest.fixture
def record():
    batch = parse_seed_source(Path(__file__).resolve().parents[3] / 'data/csv/supplier-seed-data.csv')
    assert batch.valid
    return batch.records[0]


def variant(record, **changes):
    values = record.values.model_dump()
    values.update(changes)
    return replace(record, seed_key=str(uuid4()), supplier_id=uuid4(),
                   values=type(record.values).model_validate(values))


def persist(session, record, deleted=False, **changes):
    values = record.values.model_dump()
    location = values.pop('location')
    now = datetime.now(timezone.utc)
    values.update(changes)
    supplier = Supplier(id=record.supplier_id, **values,
        location=WKTElement(f"POINT({location['longitude']} {location['latitude']})", srid=4326),
        created_at=now, updated_at=now, deleted_at=now if deleted else None, version=7,
        categories=list(session.scalars(select(Category).where(Category.name == 'Printing'))))
    session.add(supplier)
    session.flush()
    return supplier


def snapshot(connection):
    return tuple(tuple(connection.execute(text(f'SELECT * FROM {table} ORDER BY 1, 2')).all())
                 for table in ('supplier', 'category', 'supplier_category'))


def classify(session, records):
    before = snapshot(session.connection())
    result = classify_seed_records(session, records)
    assert snapshot(session.connection()) == before
    assert session.in_transaction()
    return result


def codes(decision):
    return {issue.code for issue in decision.issues}


@pytest.mark.parametrize('result_type', ['seed', 'create'])
def test_shared_insert_statement(record, result_type):
    from sqlalchemy.dialects import postgresql
    from app.repositories.suppliers import insert_supplier
    from app.schemas import SupplierCreateResult

    values = record.values
    if result_type == 'create':
        values = SupplierCreateResult(**values.model_dump(), category_ids=[uuid4()])
    statements = []

    class ExecuteOnlySession:
        def execute(self, statement):
            statements.append(statement)

    timestamp = datetime(2026, 10, 1, tzinfo=timezone.utc)
    insert_supplier(ExecuteOnlySession(), record.supplier_id, values, timestamp)
    statement, = statements
    compiled = statement.compile(dialect=postgresql.dialect())
    assert 'category_ids' not in str(compiled)
    assert 'CAST(ST_SetSRID(ST_MakePoint(' in str(compiled)
    assert 'geography(POINT,4326)' in str(compiled)
    assert compiled.params['ST_MakePoint_1'] == float(values.location.longitude)
    assert compiled.params['ST_MakePoint_2'] == float(values.location.latitude)
    assert compiled.params['ST_SetSRID_1'] == 4326
    assert compiled.params['id'] == record.supplier_id
    assert compiled.params['created_at'] == compiled.params['updated_at'] == timestamp
    assert compiled.params['version'] == 1 and compiled.params['deleted_at'] is None


@pytest.mark.parametrize('result_type', ['seed', 'create'])
def test_shared_insert_and_caller_rollback(db_connection, record, result_type, monkeypatch):
    from app.repositories.suppliers import insert_category_assignments, insert_supplier
    from app.schemas import SupplierCreateResult

    before = snapshot(db_connection)
    with Session(db_connection, join_transaction_mode='create_savepoint') as session:
        transaction = session.begin()
        category_ids = tuple(session.scalars(select(Category.id).order_by(Category.id)))
        values = record.values
        if result_type == 'create':
            values = SupplierCreateResult(**values.model_dump(), category_ids=list(category_ids))
        timestamp = datetime(2026, 10, 1, 12, 34, 56, 123456, tzinfo=timezone.utc)

        def unexpected_transaction(*args, **kwargs):
            pytest.fail('Insertion helpers must leave transactions to the caller')

        with monkeypatch.context() as patch:
            for method in ('begin', 'begin_nested', 'commit', 'rollback'):
                patch.setattr(session, method, unexpected_transaction)
            insert_supplier(session, record.supplier_id, values, timestamp)
            assert session.scalar(text('SELECT count(*) FROM supplier_category WHERE supplier_id=:id'),
                                  {'id': record.supplier_id}) == 0
            insert_category_assignments(session, record.supplier_id, category_ids)

        saved = session.get(Supplier, record.supplier_id)
        for field, value in values.model_dump(exclude={'location', 'category_ids'}).items():
            assert getattr(saved, field) == value
        assert saved.created_at == saved.updated_at == timestamp
        assert saved.created_at.utcoffset() is not None
        assert saved.version == 1 and saved.deleted_at is None
        assert {category.id for category in saved.categories} == set(category_ids)
        point = session.execute(text(
            'SELECT ST_X(location::geometry), ST_Y(location::geometry), '
            'ST_SRID(location::geometry), pg_typeof(location)::text '
            'FROM supplier WHERE id=:id'), {'id': record.supplier_id}).one()
        assert tuple(point) == (float(values.location.longitude),
                                float(values.location.latitude), 4326, 'geography')
        assert transaction.is_active
        transaction.rollback()
    assert snapshot(db_connection) == before


def test_fresh_categories_and_context(db_connection, record):
    with Session(db_connection) as session:
        result = classify(session, [record])
        decision, = result.decisions
        assert result.valid and decision.action == 'insert'
        assert decision.category_ids == tuple(session.scalars(select(Category.id).where(Category.name == 'Food')))
        assert (decision.seed_key, decision.supplier_id, decision.source) == (record.seed_key, record.supplier_id, record.source)
        assert decision.source.row_number == 2 and decision.reason
        assert classify(session, []).valid


@pytest.mark.parametrize('deleted', [False, True])
def test_edited_identity_skips(db_connection, record, deleted):
    with Session(db_connection) as session:
        persist(session, record, deleted, name='Renamed', area='Science', description='Edited',
                building='Other', floor='B2', image_key='edited.jpg',
                opening_time=None, closing_time=None, closing_day_offset=None)
        decision, = classify(session, [record]).decisions
        assert decision.action == 'skip' and not decision.issues


@pytest.mark.parametrize('deleted', [False, True])
@pytest.mark.parametrize('axis', ['latitude', 'longitude'])
def test_coordinate_conflict(db_connection, record, deleted, axis):
    with Session(db_connection) as session:
        persist(session, record, deleted)
        location = record.values.location.model_dump()
        location[axis] += Decimal('0.000000001')
        changed = replace(variant(record, location=location), supplier_id=record.supplier_id)
        decision, = classify(session, [changed]).decisions
        assert decision.action == 'conflict' and codes(decision) == {'COORDINATE_MISMATCH'}


@pytest.mark.parametrize('deleted', [False, True])
def test_persisted_duplicate(db_connection, record, deleted):
    with Session(db_connection) as session:
        persist(session, record, deleted, name=f'  {record.values.name.upper()}  ')
        decision, = classify(session, [variant(record, area='Science')]).decisions
        assert decision.action == ('insert' if deleted else 'conflict')
        if not deleted:
            assert codes(decision) == {'ACTIVE_DUPLICATE'}
            assert decision.issues[0].related_supplier_ids == (record.supplier_id,)


def test_distinct_names_and_points(db_connection, record):
    with Session(db_connection) as session:
        persist(session, record)
        records = [variant(record, name='Another stall')]
        for axis in ('longitude', 'latitude'):
            location = record.values.location.model_dump()
            location[axis] += Decimal('0.000000001')
            records.append(variant(record, location=location))
        result = classify(session, records)
        assert result.valid and [d.action for d in result.decisions] == ['insert'] * 3


def test_aggregate_conflicts(db_connection, record):
    with Session(db_connection) as session:
        persist(session, record)
        session.execute(text("DELETE FROM category WHERE name IN ('Food', 'Coffee')"))
        first = replace(variant(record), category_names=('Food', 'Coffee'))
        second = variant(record, name=record.values.name.upper())
        result = classify(session, [first, second])
        assert not result.valid
        assert all(d.action == 'conflict' for d in result.decisions)
        assert codes(result.decisions[0]) == {'MISSING_CATEGORY', 'ACTIVE_DUPLICATE', 'BATCH_DUPLICATE'}
        assert sum(i.code == 'MISSING_CATEGORY' for i in result.decisions[0].issues) == 2
        assert result == classify(session, [first, second])


def test_batch_duplicates(db_connection, record):
    with Session(db_connection) as session:
        second = variant(record, name=record.values.name.upper())
        result = classify(session, [record, second])
        assert not result.valid
        assert all(codes(d) == {'BATCH_DUPLICATE'} for d in result.decisions)
        assert result.decisions[0].issues[0].related_supplier_ids == (second.supplier_id,)


def test_skip_does_not_create_phantom_duplicates(db_connection, record):
    with Session(db_connection) as session:
        persist(session, record, name='Edited name')
        result = classify(session, [record, variant(record)])
        assert result.valid and [d.action for d in result.decisions] == ['skip', 'insert']


def test_category_and_coordinate_issues(db_connection, record):
    with Session(db_connection) as session:
        persist(session, record)
        session.execute(text("DELETE FROM category WHERE name = 'Food'"))
        changed = replace(variant(record, location={'latitude': '1.4', 'longitude': '103.8'}), supplier_id=record.supplier_id)
        decision, = classify(session, [changed]).decisions
        assert codes(decision) == {'MISSING_CATEGORY', 'COORDINATE_MISMATCH'}


def test_pending_caller_state_is_not_flushed(db_connection, record):
    with Session(db_connection) as session:
        existing = persist(session, record)
        existing.name = 'Pending edit'
        pending = Category(name='Pending definition')
        session.add(pending)
        result = classify(session, [record, variant(record)])
        assert [d.action for d in result.decisions] == ['skip', 'conflict']
        assert existing in session.dirty and pending in session.new
        assert existing.name == 'Pending edit' and pending.id is None


def test_complete_reviewed_seed_batch(db_connection):
    batch = parse_seed_source(Path(__file__).resolve().parents[3] / 'data/csv/supplier-seed-data.csv')
    assert batch.valid
    with Session(db_connection) as session:
        result = classify(session, batch.records)
        assert result.valid and len(result.decisions) == 21
        assert all(d.action == 'insert' for d in result.decisions)
        assert sum(len(d.category_ids) for d in result.decisions) == 26
        definitions = dict(session.execute(select(Category.name, Category.id)).all())
        for record, decision in zip(batch.records, result.decisions, strict=True):
            assert decision.category_ids == tuple(definitions[name] for name in record.category_names)


def test_deleted_identity_does_not_block_proposed_replacement(db_connection, record):
    with Session(db_connection) as session:
        persist(session, record, deleted=True)
        result = classify(session, [record, variant(record)])
        assert result.valid and [d.action for d in result.decisions] == ['skip', 'insert']


# These tests commit on independent connections; each owns an entire disposable
# database, which is dropped even on failure. Never use db_connection here.
@pytest.fixture
def atomic_engine(test_database_url, monkeypatch):
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import create_engine

    name = f'seed_atomic_{uuid4().hex}_test'
    admin = create_engine(test_database_url.set(database='postgres'), isolation_level='AUTOCOMMIT')
    engine = create_engine(test_database_url.set(database=name))
    try:
        with admin.connect() as connection:
            connection.execute(text(f'CREATE DATABASE "{name}"'))
        monkeypatch.setenv('DATABASE_URL', engine.url.render_as_string(hide_password=False))
        monkeypatch.setenv('USER_SERVICE_URL', 'https://localhost:8000')
        command.upgrade(Config(str(Path(__file__).resolve().parents[2] / 'alembic.ini')), 'head')
        yield engine
    finally:
        engine.dispose()
        with admin.connect() as connection:
            connection.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        admin.dispose()


@pytest.fixture
def parsed_batch():
    batch = parse_seed_source(Path(__file__).resolve().parents[3] / 'data/csv/supplier-seed-data.csv')
    assert batch.valid
    return batch


def database_counts(engine):
    with engine.connect() as connection:
        return tuple(connection.scalar(text(f'SELECT count(*) FROM {table}'))
                     for table in ('supplier', 'category', 'supplier_category'))


def test_atomic_real_csv_repeatability(atomic_engine, parsed_batch):
    from app.services.seed_import import import_seed_batch

    first = import_seed_batch(atomic_engine, parsed_batch)
    assert (first.inserted_count, first.skipped_count) == (21, 0)
    assert database_counts(atomic_engine) == (21, 4, 26)
    with atomic_engine.connect() as connection:
        before = snapshot(connection)
        points = {row.id: row for row in connection.execute(text(
            'SELECT id, ST_X(location::geometry) AS longitude, ST_Y(location::geometry) AS latitude, '
            'ST_SRID(location::geometry) AS srid FROM supplier'))}
    with Session(atomic_engine) as session:
        definitions = dict(session.execute(select(Category.name, Category.id)).all())
        for record in parsed_batch.records:
            saved = session.get(Supplier, record.supplier_id)
            for field, value in record.values.model_dump(exclude={'location'}).items():
                assert getattr(saved, field) == value
            assert saved.created_at == saved.updated_at
            assert saved.created_at.utcoffset() is not None
            assert saved.version == 1 and saved.deleted_at is None
            assert {c.id for c in saved.categories} == {definitions[n] for n in record.category_names}
            point = points[saved.id]
            assert (point.longitude, point.latitude, point.srid) == (
                float(record.values.location.longitude), float(record.values.location.latitude), 4326)
    second = import_seed_batch(atomic_engine, parsed_batch)
    assert (second.inserted_count, second.skipped_count) == (0, 21)
    assert database_counts(atomic_engine) == (21, 4, 26)
    with atomic_engine.connect() as connection:
        assert snapshot(connection) == before


def test_atomic_rerun_preserves_admin_edits_and_soft_deletion(atomic_engine, parsed_batch):
    from app.services.seed_import import import_seed_batch

    import_seed_batch(atomic_engine, parsed_batch)
    with Session(atomic_engine) as session, session.begin():
        saved = session.get(Supplier, parsed_batch.records[0].supplier_id)
        saved.name, saved.area = 'Administrator renamed', 'Science'
        saved.description, saved.building, saved.floor = 'Edited', 'New building', 'B1'
        saved.image_key = 'new.jpg'
        saved.opening_time = saved.closing_time = saved.closing_day_offset = None
        saved.version = 9
        saved.updated_at = datetime.now(timezone.utc)
        saved.categories = list(session.scalars(select(Category).where(Category.name == 'Printing')))
        deleted = session.get(Supplier, parsed_batch.records[1].supplier_id)
        deleted.deleted_at = deleted.updated_at = datetime.now(timezone.utc)
        deleted.version = 3
    with atomic_engine.connect() as connection:
        before = snapshot(connection)
    result = import_seed_batch(atomic_engine, parsed_batch)
    assert (result.inserted_count, result.skipped_count) == (0, 21)
    with atomic_engine.connect() as connection:
        assert snapshot(connection) == before


def test_atomic_rejects_invalid_or_partial_input_before_connecting(parsed_batch):
    from app.commands.seed_parsing import ParsedSeedBatch, SeedIssue
    from app.services.seed_import import import_seed_batch, SeedImportError

    invalid = ParsedSeedBatch(parsed_batch.records, (SeedIssue('source.csv', (), 'INVALID', 'Invalid'),))
    for value in (invalid, parsed_batch.records):
        with pytest.raises(SeedImportError) as caught:
            import_seed_batch(None, value)
        assert caught.value.code == 'INVALID_BATCH' and caught.value.inserted_count == 0


def test_atomic_classification_conflict_rolls_back(atomic_engine, parsed_batch):
    from app.services.seed_import import import_seed_batch, SeedImportError

    with Session(atomic_engine) as session, session.begin():
        persist(session, variant(parsed_batch.records[-1]))
    with atomic_engine.connect() as connection:
        before = snapshot(connection)
    with pytest.raises(SeedImportError) as caught:
        import_seed_batch(atomic_engine, parsed_batch)
    assert caught.value.code == 'CLASSIFICATION_CONFLICT' and caught.value.inserted_count == 0
    assert not caught.value.classification.valid
    with atomic_engine.connect() as connection:
        assert snapshot(connection) == before


@pytest.mark.parametrize('failure', ['foreign_key', 'assignment_unique'])
def test_atomic_assignment_failure_rolls_back_earlier_insert(atomic_engine, parsed_batch, monkeypatch, failure):
    from sqlalchemy.exc import IntegrityError
    from app.repositories import suppliers
    from app.services.seed_import import import_seed_batch, SeedImportError

    original = suppliers.insert_category_assignments
    calls = []

    def fail_second(session, supplier_id, category_ids):
        calls.append(supplier_id)
        if len(calls) == 2:
            assert session.scalar(text('SELECT count(*) FROM supplier')) == 2
            if failure == 'foreign_key':
                original(session, supplier_id, (uuid4(),))
            else:
                original(session, supplier_id, category_ids)
                original(session, supplier_id, category_ids)  # Unrelated uniqueness violation.
        else:
            original(session, supplier_id, category_ids)

    monkeypatch.setattr(suppliers, 'insert_category_assignments', fail_second)
    with pytest.raises(SeedImportError) as caught:
        import_seed_batch(atomic_engine, parsed_batch)
    assert caught.value.code == 'DATABASE_ERROR' and caught.value.inserted_count == 0
    assert isinstance(caught.value.__cause__, IntegrityError)
    assert caught.value.__cause__.orig.sqlstate == ('23503' if failure == 'foreign_key' else '23505')
    assert caught.value.record == parsed_batch.records[1]
    assert database_counts(atomic_engine) == (0, 4, 0)


def wait_for_database_lock(engine, pid, lock_type):
    """Observe a PostgreSQL wait instead of assuming thread scheduling timing."""
    from time import monotonic, sleep

    deadline = monotonic() + 10
    with engine.connect() as connection:
        while monotonic() < deadline:
            if connection.scalar(text(
                'SELECT EXISTS (SELECT 1 FROM pg_locks '
                'WHERE pid = :pid AND locktype = :kind AND NOT granted)'
            ), {'pid': pid, 'kind': lock_type}):
                return
            sleep(0.01)
    pytest.fail(f'Backend {pid} did not wait for {lock_type}')


@pytest.mark.parametrize('first_rolls_back', [False, True])
def test_atomic_concurrent_imports_serialize(atomic_engine, parsed_batch, monkeypatch, first_rolls_back):
    from concurrent.futures import ThreadPoolExecutor
    from queue import Queue
    from threading import Event
    from sqlalchemy import event
    from app.repositories import suppliers
    from app.services import seed_import

    first_classifying, release_first = Event(), Event()
    pids = Queue()
    original = seed_import.classify_seed_records
    assignment = suppliers.insert_category_assignments
    calls = []

    def capture_pid(conn, cursor, statement, parameters, context, executemany):
        if 'pg_advisory_xact_lock' in statement:
            pids.put(cursor.connection.info.backend_pid)

    def classify_after_lock(session, records):
        calls.append(session.scalar(text('SELECT pg_backend_pid()')))
        if len(calls) == 1:
            first_classifying.set()
            assert release_first.wait(10)
        return original(session, records)

    def fail_first(session, supplier_id, category_ids):
        assignment(session, supplier_id, (uuid4(),) if first_rolls_back and len(calls) == 1 else category_ids)

    monkeypatch.setattr(seed_import, 'classify_seed_records', classify_after_lock)
    monkeypatch.setattr(suppliers, 'insert_category_assignments', fail_first)
    event.listen(atomic_engine, 'before_cursor_execute', capture_pid)
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(seed_import.import_seed_batch, atomic_engine, parsed_batch)
            try:
                assert first_classifying.wait(10)
                first_pid = pids.get(timeout=10)
                second = pool.submit(seed_import.import_seed_batch, atomic_engine, parsed_batch)
                second_pid = pids.get(timeout=10)
                assert first_pid != second_pid
                wait_for_database_lock(atomic_engine, second_pid, 'advisory')
                assert len(calls) == 1
            finally:
                release_first.set()
            if first_rolls_back:
                with pytest.raises(seed_import.SeedImportError):
                    first.result(timeout=10)
                assert second.result(timeout=10).inserted_count == 21
            else:
                assert first.result(timeout=10).inserted_count == 21
                result = second.result(timeout=10)
                assert (result.inserted_count, result.skipped_count) == (0, 21)
        assert len(calls) == 2
        assert database_counts(atomic_engine) == (21, 4, 26)
    finally:
        event.remove(atomic_engine, 'before_cursor_execute', capture_pid)


@pytest.mark.parametrize('api_commits', [False, True])
@pytest.mark.parametrize('collision', ['active_duplicate', 'primary_key'])
def test_atomic_concurrent_api_write(atomic_engine, parsed_batch, monkeypatch, api_commits, collision):
    from concurrent.futures import ThreadPoolExecutor
    from queue import Queue
    from threading import Event
    from app.repositories import suppliers
    from app.services import seed_import

    ready, resume = Event(), Event()
    pids = Queue()
    original = suppliers.insert_supplier
    target = parsed_batch.records[1]

    def pause_before_second_insert(session, supplier_id, values, timestamp):
        if supplier_id == target.supplier_id:
            pids.put(session.scalar(text('SELECT pg_backend_pid()')))
            ready.set()
            assert resume.wait(10)
        original(session, supplier_id, values, timestamp)

    monkeypatch.setattr(suppliers, 'insert_supplier', pause_before_second_insert)
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(seed_import.import_seed_batch, atomic_engine, parsed_batch)
        try:
            assert ready.wait(10)
            importer_pid = pids.get(timeout=10)
            with atomic_engine.connect() as connection:
                transaction = connection.begin()
                try:
                    with Session(connection) as api_session:
                        # Deliberately no seed lock on this API-style writer.
                        identity = uuid4() if collision == 'active_duplicate' else target.supplier_id
                        values = target.values if collision == 'active_duplicate' else variant(target, name='API identity').values
                        original(api_session, identity, values, datetime.now(timezone.utc))
                        resume.set()
                        wait_for_database_lock(atomic_engine, importer_pid, 'transactionid')
                        assert not future.done()
                        if api_commits:
                            transaction.commit()
                        else:
                            transaction.rollback()
                finally:
                    if transaction.is_active:
                        transaction.rollback()
        finally:
            resume.set()
        if api_commits:
            with pytest.raises(seed_import.SeedImportError) as caught:
                future.result(timeout=10)
            expected = 'ACTIVE_DUPLICATE' if collision == 'active_duplicate' else 'IDENTITY_CONFLICT'
            assert caught.value.code == expected and caught.value.inserted_count == 0
            assert caught.value.record == target
            assert database_counts(atomic_engine) == (1, 4, 0)
            with atomic_engine.connect() as connection:
                assert connection.scalar(text('SELECT id FROM supplier')) == identity
                assert connection.scalar(text('SELECT name FROM supplier')) == values.name
        else:
            result = future.result(timeout=10)
            assert (result.inserted_count, result.skipped_count) == (21, 0)
            assert database_counts(atomic_engine) == (21, 4, 26)



def test_atomic_commit_exception_is_conservatively_unknown(atomic_engine, parsed_batch):
    from sqlalchemy import event
    from sqlalchemy.exc import OperationalError
    from app.services.seed_import import import_seed_batch, SeedImportError

    def fail_before_commit(connection):
        # All rows have been inserted, but commit has not reached PostgreSQL yet.
        assert connection.scalar(text('SELECT count(*) FROM supplier')) == 21
        assert connection.scalar(text('SELECT count(*) FROM supplier_category')) == 26
        raise OperationalError('COMMIT', {}, RuntimeError('Injected commit failure'))

    event.listen(atomic_engine, 'commit', fail_before_commit)
    try:
        with pytest.raises(SeedImportError) as caught:
            import_seed_batch(atomic_engine, parsed_batch)
        # The importer cannot distinguish this commit-stage exception from a
        # transport failure after the server committed; do not assert rollback.
        assert caught.value.code == 'COMMIT_OUTCOME_UNKNOWN'
        assert caught.value.inserted_count is None and caught.value.outcome == 'unknown'
        assert isinstance(caught.value.__cause__, OperationalError)
    finally:
        event.remove(atomic_engine, 'commit', fail_before_commit)
    assert database_counts(atomic_engine) == (0, 4, 0)


def run_seed_cli(engine, directory, *extra, source=None):
    import json
    import os
    import subprocess
    import sys

    service = Path(__file__).resolve().parents[2]
    source = source or service.parent / 'data/csv/supplier-seed-data.csv'
    env = {key: value for key, value in os.environ.items() if not any(
        token in key.upper() for token in ('DATABASE', 'POSTGRES', 'USER_SERVICE', 'AUTH_TIMEOUT', 'LOG_LEVEL')
    )}
    env.update(DATABASE_URL=engine.url.render_as_string(hide_password=False),
               USER_SERVICE_URL='https://localhost:8000', PYTHONPATH=str(service))
    completed = subprocess.run(
        [sys.executable, '-m', 'app.commands.seed_suppliers', '--file', str(source), *extra],
        cwd=directory, env=env, capture_output=True, text=True, timeout=20,
    )
    assert 'Traceback' not in completed.stderr
    if engine.url.password:
        assert engine.url.password not in completed.stdout + completed.stderr
    return completed.returncode, json.loads(completed.stdout)


def test_cli_preview_first_and_repeat_import(atomic_engine, tmp_path):
    service = Path(__file__).resolve().parents[2]
    files = [service.parent / 'data/csv/supplier-seed-data.csv',
             service / 'seed/manifest.json', service / 'seed/area_mapping.json']
    before_files = {path: path.read_bytes() for path in files}
    with atomic_engine.connect() as connection:
        before = snapshot(connection)
    code, preview = run_seed_cli(atomic_engine, tmp_path, '--dry-run')
    assert code == 0 and preview['preview'] and not preview['committed']
    assert preview['proposed_insert_count'] == 21 and preview['inserted_count'] == 0
    assert preview['skipped_count'] == preview['conflict_count'] == 0
    assert 'may change' in preview['message']
    with atomic_engine.connect() as connection:
        assert snapshot(connection) == before
    code, first = run_seed_cli(atomic_engine, tmp_path)
    assert code == 0 and first['committed'] and not first['preview']
    assert first['inserted_count'] == 21 and first['proposed_insert_count'] == 21
    assert database_counts(atomic_engine) == (21, 4, 26)
    with atomic_engine.connect() as connection:
        before = snapshot(connection)
    for extra in [(), ('--dry-run',)]:
        code, report = run_seed_cli(atomic_engine, tmp_path, *extra)
        assert code == 0 and report['inserted_count'] == 0 and report['skipped_count'] == 21
        assert report['source_count'] == report['validated_supplier_count'] == 21
        assert report['total_category_assignments'] == 26
        assert report['category_counts'] == {'Food': 16, 'Coffee': 5, 'Shopping': 3, 'Printing': 2}
        assert len(report['reviewed_corrections']) == 5 and not report['issues']
        with atomic_engine.connect() as connection:
            assert snapshot(connection) == before
    assert {path: path.read_bytes() for path in files} == before_files


@pytest.mark.parametrize('heads', [[], ['0001'], ['9999'], ['0002', 'branch']])
@pytest.mark.parametrize('dry_run', [False, True])
def test_cli_migration_mismatch_never_writes(atomic_engine, tmp_path, heads, dry_run):
    with atomic_engine.begin() as connection:
        connection.execute(text('DELETE FROM alembic_version'))
        for head in heads:
            connection.execute(text('INSERT INTO alembic_version VALUES (:head)'), {'head': head})
    code, report = run_seed_cli(atomic_engine, tmp_path, *(['--dry-run'] if dry_run else []))
    assert code == 1 and report['batch_rejected'] and not report['committed']
    assert report['issues'][-1]['code'] == 'MIGRATION_MISMATCH'
    assert 'migration' in report['message'] and report['decisions'] == []
    assert report['inserted_count'] == 0 and database_counts(atomic_engine) == (0, 4, 0)
    with atomic_engine.connect() as connection:
        assert set(connection.scalars(text('SELECT version_num FROM alembic_version'))) == set(heads)


@pytest.mark.parametrize('kind', ['identity', 'duplicate', 'deleted'])
@pytest.mark.parametrize('dry_run', [False, True])
def test_cli_identity_duplicate_and_deleted_decisions(atomic_engine, parsed_batch, tmp_path, kind, dry_run):
    source = parsed_batch.records[0]
    with Session(atomic_engine) as session, session.begin():
        if kind == 'identity':
            changed = replace(variant(source, location={'longitude': '103.8', 'latitude': '1.4'}),
                              supplier_id=source.supplier_id)
            persist(session, changed)
        elif kind == 'duplicate':
            persist(session, variant(source))
        else:
            persist(session, source, deleted=True, name='Edited deleted identity')
    with atomic_engine.connect() as connection:
        before = snapshot(connection)
    code, report = run_seed_cli(atomic_engine, tmp_path, *(['--dry-run'] if dry_run else []))
    if kind == 'deleted':
        assert code == 0 and report['skipped_count'] == 1 and report['conflict_count'] == 0
        assert report['inserted_count'] == (0 if dry_run else 20)
        with atomic_engine.connect() as connection:
            saved = connection.execute(text('SELECT * FROM supplier WHERE id=:id'), {'id': source.supplier_id}).one()
            assert saved == before[0][0]
    else:
        assert code == 1 and report['conflict_count'] == 1 and report['inserted_count'] == 0
        assert report['batch_rejected'] and not report['committed']
        expected = 'COORDINATE_MISMATCH' if kind == 'identity' else 'ACTIVE_DUPLICATE'
        issue = next(issue for issue in report['issues'] if issue['code'] == expected)
        assert issue['seed_key'] and issue['supplier_id'] and issue['row_number'] and issue['file']
    if dry_run or kind != 'deleted':
        with atomic_engine.connect() as connection:
            assert snapshot(connection) == before


@pytest.mark.parametrize('dry_run', [False, True])
def test_cli_malformed_source_rejects_entire_batch(atomic_engine, tmp_path, dry_run):
    import csv

    source = Path(__file__).resolve().parents[3] / 'data/csv/supplier-seed-data.csv'
    with source.open(encoding='cp1252', newline='') as stream:
        reader = csv.DictReader(stream)
        fields, rows = reader.fieldnames, list(reader)
    rows[0].update(Type='Unknown', Latitude='NaN')
    rows[1]['ClosingTime'] = 'invalid'
    bad = tmp_path / 'bad.csv'
    with bad.open('w', encoding='cp1252', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    code, report = run_seed_cli(atomic_engine, tmp_path, *(['--dry-run'] if dry_run else []), source=bad)
    assert code == 1 and report['batch_rejected'] and report['validated_supplier_count'] == 19
    assert report['inserted_count'] == 0 and report['decisions'] == []
    assert {'UNKNOWN_CATEGORY', 'INVALID_COORDINATE', 'INVALID_SOURCE_TIME'} <= {i['code'] for i in report['issues']}
    assert database_counts(atomic_engine) == (0, 4, 0)


def test_cli_rollback_reports_zero_committed_inserts(atomic_engine, monkeypatch, capsys):
    import json
    from app.commands.seed_suppliers import main
    from app.repositories import suppliers

    original = suppliers.insert_category_assignments
    count = 0

    def fail_second(session, identity, category_ids):
        nonlocal count
        count += 1
        original(session, identity, (uuid4(),) if count == 2 else category_ids)

    monkeypatch.setattr(suppliers, 'insert_category_assignments', fail_second)
    source = Path(__file__).resolve().parents[3] / 'data/csv/supplier-seed-data.csv'
    assert main(['--file', str(source)]) == 1
    report = json.loads(capsys.readouterr().out)
    assert report['rolled_back'] and report['batch_rejected'] and not report['committed']
    assert report['commit_outcome'] == 'rolled_back'
    assert report['inserted_count'] == 0 and report['proposed_insert_count'] == 21
    assert report['issues'][-1]['code'] == 'DATABASE_ERROR'
    assert report['issues'][-1]['seed_key'] and report['issues'][-1]['row_number']
    assert database_counts(atomic_engine) == (0, 4, 0)


def test_preview_enforces_read_only_transaction(atomic_engine, parsed_batch, monkeypatch):
    from sqlalchemy.exc import DBAPIError
    from app.services import seed_import

    def attempt_write(session, records):
        assert session.scalar(text('SHOW transaction_read_only')) == 'on'
        session.execute(text("UPDATE category SET name = name"))

    monkeypatch.setattr(seed_import, 'classify_seed_records', attempt_write)
    with Session(atomic_engine) as session:
        with pytest.raises(DBAPIError) as caught:
            seed_import.preview_seed_batch(session, parsed_batch)
        assert caught.value.orig.sqlstate == '25006'
    assert database_counts(atomic_engine) == (0, 4, 0)


def test_real_run_reclassifies_after_preview(atomic_engine, parsed_batch, tmp_path):
    code, preview = run_seed_cli(atomic_engine, tmp_path, '--dry-run')
    assert code == 0 and preview['proposed_insert_count'] == 21
    with Session(atomic_engine) as session, session.begin():
        persist(session, variant(parsed_batch.records[0]))
    code, report = run_seed_cli(atomic_engine, tmp_path)
    assert code == 1 and report['conflict_count'] == 1 and report['inserted_count'] == 0
    assert database_counts(atomic_engine) == (1, 4, 1)


@pytest.mark.parametrize('dry_run', [False, True])
def test_cli_connectivity_failure_has_safe_json(tmp_path, dry_run):
    from sqlalchemy import create_engine

    engine = create_engine('postgresql+psycopg://test_user:private-token@127.0.0.1:1/supplier_test')
    try:
        code, report = run_seed_cli(engine, tmp_path, *(['--dry-run'] if dry_run else []))
    finally:
        engine.dispose()
    assert code == 1 and report['batch_rejected'] and not report['committed']
    assert report['issues'][-1]['code'] == 'DATABASE_ERROR'
    assert report['inserted_count'] == 0


@pytest.mark.parametrize('password', [None, '', 'configured-secret'])
def test_cli_helper_handles_optional_passwords(tmp_path, monkeypatch, password):
    import subprocess
    from sqlalchemy import create_engine
    from sqlalchemy.engine import URL

    engine = create_engine(URL.create('postgresql+psycopg', username='test_user',
                                     password=password, host='localhost', database='supplier_test'))
    output = subprocess.CompletedProcess([], 0, '{"valid": true}', '')
    monkeypatch.setattr(subprocess, 'run', lambda *args, **kwargs: output)
    try:
        assert run_seed_cli(engine, tmp_path) == (0, {'valid': True})
        if password:
            for stream in ('stdout', 'stderr'):
                leaked = subprocess.CompletedProcess([], 0, '{"valid": true}', '')
                setattr(leaked, stream, password)
                monkeypatch.setattr(subprocess, 'run', lambda *args, **kwargs: leaked)
                with pytest.raises(AssertionError):
                    run_seed_cli(engine, tmp_path)
    finally:
        engine.dispose()



@pytest.mark.parametrize('via_cli', [False, True])
def test_successful_commit_with_lost_acknowledgement(atomic_engine, parsed_batch, monkeypatch, capsys, via_cli):
    import json
    import psycopg
    from app import db
    from app.commands.seed_suppliers import main
    from app.services.seed_import import import_seed_batch, SeedImportError

    original_commit = atomic_engine.dialect.do_commit
    committed = []

    def commit_then_lose_acknowledgement(connection):
        original_commit(connection)  # Real PostgreSQL COMMIT succeeds.
        committed.append(True)
        connection.close()
        raise psycopg.OperationalError('Lost acknowledgement; password=private-test-secret')

    monkeypatch.setattr(atomic_engine.dialect, 'do_commit', commit_then_lose_acknowledgement)
    if via_cli:
        monkeypatch.setattr(db, 'create_db_engine', lambda settings: atomic_engine)
        source = Path(__file__).resolve().parents[3] / 'data/csv/supplier-seed-data.csv'
        assert main(['--file', str(source)]) == 1
        output = capsys.readouterr()
        assert 'private-test-secret' not in output.out + output.err
        assert 'Traceback' not in output.err
        report = json.loads(output.out)
        assert report['commit_outcome'] == 'unknown'
        assert report['committed'] is None and report['rolled_back'] is None
        assert report['batch_rejected'] is None and report['inserted_count'] is None
        assert not report['valid'] and report['proposed_insert_count'] == 21
        assert report['issues'][-1]['code'] == 'COMMIT_OUTCOME_UNKNOWN'
        assert 'may have been committed' in report['message']
        assert 'manifest UUIDs' in report['message'] and 'rerun' in report['message']
        assert 'rolled back' not in report['message']
    else:
        with pytest.raises(SeedImportError) as caught:
            import_seed_batch(atomic_engine, parsed_batch)
        assert caught.value.code == 'COMMIT_OUTCOME_UNKNOWN'
        assert caught.value.outcome == 'unknown' and caught.value.inserted_count is None
        assert 'private-test-secret' not in str(caught.value)
    assert committed == [True]
    monkeypatch.setattr(atomic_engine.dialect, 'do_commit', original_commit)
    # A separate connection establishes that zero would have been a false count.
    assert database_counts(atomic_engine) == (21, 4, 26)
    with atomic_engine.connect() as connection:
        before = snapshot(connection)
    rerun = import_seed_batch(atomic_engine, parsed_batch)
    assert (rerun.inserted_count, rerun.skipped_count) == (0, 21)
    with atomic_engine.connect() as connection:
        assert snapshot(connection) == before


def test_failure_before_commit_has_confirmed_rollback(atomic_engine, parsed_batch, monkeypatch):
    from sqlalchemy.exc import OperationalError
    from app.services.seed_import import import_seed_batch, SeedImportError

    def fail_flush(session, *args, **kwargs):
        assert session.connection().scalar(text('SELECT count(*) FROM supplier')) == 21
        assert session.connection().scalar(text('SELECT count(*) FROM supplier_category')) == 26
        raise OperationalError('flush', {}, RuntimeError('pre-commit failure'))

    monkeypatch.setattr(Session, 'flush', fail_flush)
    with pytest.raises(SeedImportError) as caught:
        import_seed_batch(atomic_engine, parsed_batch)
    assert caught.value.code == 'DATABASE_ERROR'
    assert caught.value.outcome == 'rolled_back' and caught.value.inserted_count == 0
    assert database_counts(atomic_engine) == (0, 4, 0)


def test_reimport_preserves_identity_deleted_through_mounted_route(
    create_engine_db, parsed_batch, patch_client,
):
    from app.services.seed_import import import_seed_batch

    client = patch_client.client
    imported = import_seed_batch(create_engine_db, parsed_batch)
    assert (imported.inserted_count, imported.skipped_count) == (21, 0)
    identity = parsed_batch.records[0].supplier_id
    with Session(create_engine_db) as session:
        category = session.scalar(select(Category.id).where(Category.name == 'Printing'))
    edited = patch_supplier(client, identity, 1, {
        'name': 'Retained administrator edit', 'area': 'Science',
        'description': 'Preserved history', 'building': 'Edited building', 'floor': 'B1',
        'image_key': 'retained.jpg', 'opening_time': None, 'closing_time': None,
        'category_ids': [str(category)],
    })
    assert edited.status_code == 200
    deleted = client.delete(f'/suppliers/{identity}', headers=ADMIN_HEADERS,
                            params={'expected_version': edited.json()['version']})
    assert deleted.status_code == 204 and deleted.content == b''
    history = client.get(f'/admin/suppliers/{identity}', headers=ADMIN_HEADERS)
    assert history.status_code == 200
    retained = history.json()
    assert retained == {**edited.json(), 'deleted_at': retained['deleted_at'],
                        'updated_at': retained['deleted_at'], 'version': 3}
    assert retained['deleted_at'] is not None
    with create_engine_db.connect() as connection:
        before = snapshot(connection)
    rerun = import_seed_batch(create_engine_db, parsed_batch)
    assert (rerun.inserted_count, rerun.skipped_count) == (0, 21)
    with create_engine_db.connect() as connection:
        assert snapshot(connection) == before
    assert client.get(f'/admin/suppliers/{identity}', headers=ADMIN_HEADERS).json() == retained
    assert client.get(f'/suppliers/{identity}').status_code == 404
    for status, total in [('deleted', 1), ('all', 21)]:
        response = client.get('/admin/suppliers', headers=ADMIN_HEADERS,
                              params={'status': status, 'limit': 100})
        assert response.status_code == 200
        page = response.json()
        assert page['total'] == total
        assert [item for item in page['items'] if item['id'] == str(identity)] == [retained]
    with create_engine_db.begin() as connection:
        connection.execute(select(Supplier.id).where(
            Supplier.id == identity).with_for_update(nowait=True))
