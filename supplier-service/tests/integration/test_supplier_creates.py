# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-10-01
# Scope: Writing implementation code; Boilerplate generation — configure disposable migrated PostGIS databases and test atomic creation, validation, detached values, duplicate policy, rollback, availability failures, and uncertain commits without retry.
# Scope: Writing implementation code; Boilerplate generation — add mounted POST/public GET tests on real PostGIS with controlled administrator authentication, exact duplicate and deleted-history checks, post-insert rollback, and synchronized independent commit/rollback races. (ai-20261001-004)
# Author review: Keith confirmed review of the earlier creation tests and the retained duplicate-policy/concurrency coverage (ai-20261001-004).
# Details: ../../ai/usage-log.md; ai-20261001-002; ai-20261001-004

"""Atomic creation on isolated PostGIS, plus safe service error classification."""

from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import datetime, time, timedelta, timezone
from pathlib import Path
from queue import Queue
from threading import Event
from time import monotonic
from traceback import format_exception
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import UUID, uuid4

import httpx
import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select, text, update
from sqlalchemy.exc import DBAPIError, IntegrityError, OperationalError, ProgrammingError, TimeoutError
from sqlalchemy.orm import Session

from app.clients.user_service import UserServiceClient
from app.db import create_session_factory
from app.main import create_app
from app.models import Category, Supplier
from app.repositories.suppliers import find_active_detail
from app.schemas import SupplierResponse
from app.services import suppliers
from app.validation.errors import DomainValidationError


@pytest.fixture
def create_engine_db(test_database_url, monkeypatch):
    # Real commits need an entire disposable database, not an outer test transaction.
    name = f'supplier_create_{uuid4().hex}_test'
    admin = create_engine(test_database_url.set(database='postgres'), isolation_level='AUTOCOMMIT')
    engine = create_engine(test_database_url.set(database=name))
    try:
        with admin.connect() as connection:
            connection.execute(text(f'CREATE DATABASE "{name}"'))
        monkeypatch.setenv('DATABASE_URL', engine.url.render_as_string(hide_password=False))
        monkeypatch.setenv('USER_SERVICE_URL', 'http://localhost:8000')
        command.upgrade(Config(str(Path(__file__).resolve().parents[2] / 'alembic.ini')), 'head')
        yield engine
    finally:
        engine.dispose()
        with admin.connect() as connection:
            connection.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        admin.dispose()


@pytest.fixture
def payload(create_engine_db):
    with Session(create_engine_db) as session:
        ids = list(session.scalars(select(Category.id).order_by(Category.name).limit(2)))
    assert len(ids) == 2
    return {
        'name': '  Display Name  ', 'area': ' Science ',
        'location': {'latitude': '1.291876', 'longitude': '103.781234'},
        'category_ids': [str(ids[1]), str(ids[0]), str(ids[1])],
        'description': ' Description ', 'building': ' Building ', 'floor': ' B1 ',
        'image_key': ' supplier/example.jpg ',
        'opening_time': '10:00:00', 'closing_time': '19:30:00',
    }


def counts(engine):
    with engine.connect() as connection:
        return tuple(connection.scalar(text(f'SELECT count(*) FROM {table}'))
                     for table in ('supplier', 'supplier_category'))


@pytest.mark.parametrize('opening,closing,offset', [
    ('10:00:00', '19:30:00', 0), ('22:30:00', '02:15:00', 1),
    ('08:15:00', '08:15:00', 1), (None, None, None),
])
@pytest.mark.parametrize('nullable', [False, True])
def test_create_persists_and_returns_detached_value(create_engine_db, payload, opening, closing, offset, nullable):
    payload.update(opening_time=opening, closing_time=closing)
    optional = ('description', 'building', 'floor', 'image_key')
    if nullable:
        payload.update(dict.fromkeys(optional))
    original = deepcopy(payload)
    factory = create_session_factory(create_engine_db)
    before = datetime.now(timezone.utc)
    with factory() as session:
        assert not session.in_transaction()
        result = suppliers.create_supplier(session, payload)
        assert not session.in_transaction()
    after = datetime.now(timezone.utc)
    assert payload == original
    assert result.id.version == 4
    assert result.name == 'Display Name' and result.area == 'Science'
    for field in optional:
        expected = None if nullable else payload[field].strip()
        assert getattr(result, field) == expected
    assert result.opening_time == (time.fromisoformat(opening) if opening else None)
    assert result.closing_time == (time.fromisoformat(closing) if closing else None)
    assert result.closing_day_offset == offset
    assert result.created_at == result.updated_at
    assert before <= result.created_at <= after
    assert result.created_at.utcoffset() == timedelta(0)
    assert result.version == 1 and result.deleted_at is None
    assert result.latitude == pytest.approx(1.291876, abs=1e-9)
    assert result.longitude == pytest.approx(103.781234, abs=1e-9)
    assert {str(category.id) for category in result.categories} == set(payload['category_ids'])
    assert counts(create_engine_db) == (1, 2)
    # A separate session sees the committed write, and serialization needs no session.
    with factory() as session:
        assert find_active_detail(session, result.id) == result
        assert session.scalar(text('SELECT ST_SRID(location::geometry) FROM supplier')) == 4326
    response = SupplierResponse.from_read(result)
    assert response.id == result.id
    assert len(response.model_dump(mode='json')['categories']) == 2


def test_transaction_order_and_single_identity_timestamp(create_engine_db, payload, monkeypatch):
    identity = uuid4()
    timestamp = datetime(2026, 10, 1, 12, 34, 56, 123456, tzinfo=timezone.utc)
    id_source = Mock(return_value=identity)
    clock = Mock()
    clock.now.return_value = timestamp
    monkeypatch.setattr(suppliers, 'uuid4', id_source)
    monkeypatch.setattr(suppliers, 'datetime', clock)
    steps = []
    with Session(create_engine_db) as session:
        event.listen(session, 'after_transaction_create', lambda *args: steps.append('begin'))
        event.listen(session, 'after_commit', lambda *args: steps.append('commit'))
        for name in ('read_categories', 'insert_supplier', 'insert_category_assignments', 'find_active_detail'):
            original = getattr(suppliers, name)

            def track(*args, _name=name, _original=original):
                assert session.in_transaction()
                steps.append(_name)
                return _original(*args)

            monkeypatch.setattr(suppliers, name, track)
        flush = session.flush

        def track_flush(*args, **kwargs):
            steps.append('flush')
            return flush(*args, **kwargs)

        monkeypatch.setattr(session, 'flush', track_flush)
        result = suppliers.create_supplier(session, payload)
        steps.append('returned')
    assert steps == ['begin', 'read_categories', 'insert_supplier',
                     'insert_category_assignments', 'flush', 'find_active_detail', 'commit', 'returned']
    id_source.assert_called_once_with()
    clock.now.assert_called_once_with(timezone.utc)
    assert result.id == identity and result.created_at == result.updated_at == timestamp


@pytest.mark.parametrize('invalid,expected', [
    ('unknown', [('category_ids.1', 'UNKNOWN_CATEGORY'), ('category_ids.3', 'UNKNOWN_CATEGORY')]),
    ('empty', [('category_ids', 'EMPTY_CATEGORIES')]),
    ('partial', [('opening_time', 'INCOMPLETE_SCHEDULE')]),
    ('malformed', [('closing_time', 'INVALID_TIME')]),
    ('timezone', [('closing_time', 'TIMEZONE_NOT_ALLOWED')]),
])
def test_invalid_input_writes_nothing(create_engine_db, payload, monkeypatch, invalid, expected):
    if invalid == 'unknown':
        known = payload['category_ids'][0]
        unknown = str(uuid4())
        payload['category_ids'] = [known, unknown, known, unknown]
    elif invalid == 'empty':
        payload['category_ids'] = []
    else:
        payload['closing_time'] = {'partial': None, 'malformed': 'bad', 'timezone': '10:00:00+08:00'}[invalid]
    insert = Mock(side_effect=AssertionError('Invalid input must never insert'))
    monkeypatch.setattr(suppliers, 'insert_supplier', insert)
    with Session(create_engine_db) as session:
        with pytest.raises(DomainValidationError) as caught:
            suppliers.create_supplier(session, payload)
        assert [(issue.fields[0], issue.code) for issue in caught.value.errors] == expected
        assert not session.in_transaction()
        assert session.scalar(text('SELECT 1')) == 1
    insert.assert_not_called()
    assert counts(create_engine_db) == (0, 0)


def test_assignment_failure_rolls_back_and_session_can_create_again(create_engine_db, payload, monkeypatch):
    original = suppliers.insert_category_assignments

    def fail_assignment(session, identity, category_ids):
        assert session.get(Supplier, identity) is not None
        original(session, identity, (uuid4(),))

    with Session(create_engine_db) as session:
        with monkeypatch.context() as patch:
            patch.setattr(suppliers, 'insert_category_assignments', fail_assignment)
            with pytest.raises(IntegrityError) as caught:
                suppliers.create_supplier(session, payload)
        assert caught.value.orig.sqlstate == '23503'
        assert not session.in_transaction()
        assert counts(create_engine_db) == (0, 0)
        result = suppliers.create_supplier(session, payload)
        assert result.id
    assert counts(create_engine_db) == (1, 2)


def test_exact_active_duplicate_policy(create_engine_db, payload):
    with Session(create_engine_db) as session:
        first = suppliers.create_supplier(session, payload)
        duplicate = dict(payload, name='  DISPLAY NAME  ', area='FASS')
        with pytest.raises(suppliers.SupplierDuplicate) as caught:
            suppliers.create_supplier(session, duplicate)
        assert not session.in_transaction()
        assert caught.value.__cause__ is None
        assert 'uq_supplier' not in ''.join(format_exception(caught.value))
        assert counts(create_engine_db) == (1, 2)
        # Exact coordinates, rather than proximity, determine duplication.
        branch = dict(duplicate, location=dict(payload['location'], longitude='103.781234001'))
        assert suppliers.create_supplier(session, branch).id != first.id
        assert suppliers.create_supplier(session, dict(payload, name='Other name')).id != first.id
        with session.begin():
            session.execute(update(Supplier).where(Supplier.id == first.id).values(
                deleted_at=datetime.now(timezone.utc)))
        assert suppliers.create_supplier(session, duplicate).id != first.id
    assert counts(create_engine_db) == (4, 8)


def database_error(error_type, state=None, constraint=None, *, invalidated=False):
    original = Exception('secret database diagnostics')
    original.sqlstate = state
    original.diag = SimpleNamespace(constraint_name=constraint)
    return error_type('SECRET SQL', {}, original, connection_invalidated=invalidated)


@pytest.mark.parametrize('failure', [
    TimeoutError('secret pool details'), database_error(OperationalError),
    database_error(OperationalError, '08006'), database_error(OperationalError, '53300'),
    database_error(OperationalError, '57P01'), database_error(OperationalError, '57P02'),
    database_error(OperationalError, '57P03'), database_error(DBAPIError, invalidated=True),
])
def test_creation_availability_is_safe_and_rolls_back(monkeypatch, failure):
    monkeypatch.setattr(suppliers, 'read_categories', Mock(side_effect=failure))
    with Session() as session:
        with pytest.raises(suppliers.SupplierCreateUnavailable) as caught:
            suppliers.create_supplier(session, {})
        assert not session.in_transaction()
    assert str(caught.value) == 'Supplier creation is temporarily unavailable.'
    assert caught.value.__cause__ is None
    rendered = ''.join(format_exception(caught.value))
    assert 'secret' not in rendered and 'SECRET SQL' not in rendered


@pytest.mark.parametrize('failure', [
    ValueError('mapping defect'), database_error(ProgrammingError, '42703'),
    database_error(OperationalError, '42883'), database_error(OperationalError, '40001'),
    database_error(IntegrityError, '23505', 'supplier_pkey'),
    database_error(IntegrityError, '23505'),
    database_error(IntegrityError, '23514', 'uq_supplier_active_name_location'),
])
def test_unrelated_failures_propagate_after_rollback(monkeypatch, failure):
    monkeypatch.setattr(suppliers, 'read_categories', Mock(side_effect=failure))
    with Session() as session:
        with pytest.raises(type(failure)) as caught:
            suppliers.create_supplier(session, {})
        assert caught.value is failure
        assert not session.in_transaction()


@pytest.mark.parametrize('stage', ['flush', 'detail', 'commit'])
@pytest.mark.parametrize('unavailable', [False, True])
def test_late_failure_never_returns_or_leaves_partial_rows(create_engine_db, payload, monkeypatch, stage, unavailable):
    failure = database_error(OperationalError, '08006') if unavailable else ValueError('unexpected defect')
    expected = suppliers.SupplierCreateUnavailable if unavailable else ValueError
    with Session(create_engine_db) as session:
        def fail(*args, **kwargs):
            raise failure

        if stage == 'flush':
            monkeypatch.setattr(session, 'flush', fail)
        elif stage == 'detail':
            monkeypatch.setattr(suppliers, 'find_active_detail', fail)
        else:
            event.listen(session, 'before_commit', fail)
        with pytest.raises(expected):
            suppliers.create_supplier(session, payload)
        assert not session.in_transaction()
    assert counts(create_engine_db) == (0, 0)


def test_missing_inserted_detail_rolls_back(create_engine_db, payload, monkeypatch):
    monkeypatch.setattr(suppliers, 'find_active_detail', lambda *args: None)
    with Session(create_engine_db) as session:
        with pytest.raises(RuntimeError, match='could not be loaded'):
            suppliers.create_supplier(session, payload)
        assert not session.in_transaction()
    assert counts(create_engine_db) == (0, 0)


def test_lost_commit_acknowledgement_does_not_retry(create_engine_db, payload, monkeypatch):
    commit = create_engine_db.dialect.do_commit
    attempts = []

    def commit_then_fail(connection):
        attempts.append(connection)
        commit(connection)
        raise database_error(OperationalError, '08006')

    with Session(create_engine_db) as session:
        with monkeypatch.context() as patch:
            patch.setattr(create_engine_db.dialect, 'do_commit', commit_then_fail)
            with pytest.raises(suppliers.SupplierCreateUnavailable):
                suppliers.create_supplier(session, payload)
        assert not session.in_transaction()
    assert len(attempts) == 1
    # The server committed: the service must not report success or retry the write.
    assert counts(create_engine_db) == (1, 2)
    with Session(create_engine_db) as session:
        with pytest.raises(suppliers.SupplierDuplicate):
            suppliers.create_supplier(session, payload)


ADMIN_HEADERS = {'Authorization': 'Bearer integration-admin-session'}


@pytest.fixture
def post_client(create_engine_db, settings, monkeypatch):
    """Mounted routes, real request sessions/storage, controlled upstream identity."""
    authentication_requests = []

    def authenticate(request):
        assert str(request.url) == 'http://localhost:8000/users/me'
        assert request.headers['Authorization'] == ADMIN_HEADERS['Authorization']
        authentication_requests.append(request)
        return httpx.Response(200, json={
            'id': str(UUID(int=42)), 'role': 'admin', 'status': 'active',
        })

    monkeypatch.setattr('app.main.create_db_engine', lambda settings: create_engine_db)
    monkeypatch.setattr('app.main.UserServiceClient', lambda settings: UserServiceClient(
        settings, transport=httpx.MockTransport(authenticate),
    ))
    application = create_app(settings)
    assert application.dependency_overrides == {}
    # Unexpected errors produce their real 500 response, enabling rollback checks.
    with TestClient(application, raise_server_exceptions=False) as client:
        yield client, authentication_requests


def post_supplier(client, payload):
    return client.post('/suppliers', headers=ADMIN_HEADERS, json=payload)


def supplier_snapshot(engine):
    with engine.connect() as connection:
        return (
            tuple(connection.execute(text('SELECT * FROM supplier ORDER BY id'))),
            tuple(connection.execute(text(
                'SELECT * FROM supplier_category ORDER BY supplier_id, category_id'))),
        )


def assert_assignment_pairs(engine, supplier_ids, category_ids):
    with engine.connect() as connection:
        assert set(connection.execute(text('SELECT id FROM supplier')).scalars()) == {
            UUID(identity) for identity in supplier_ids
        }
        assert set(connection.execute(text(
            'SELECT supplier_id, category_id FROM supplier_category'))) == {
                (UUID(identity), UUID(category))
                for identity in supplier_ids for category in category_ids
            }


@pytest.mark.parametrize('nullable', [False, True])
def test_post_commits_canonical_public_detail(post_client, create_engine_db, payload, nullable):
    client, authentication = post_client
    if nullable:
        payload.update(dict.fromkeys((
            'description', 'building', 'floor', 'image_key', 'opening_time', 'closing_time',
        )))
    response = post_supplier(client, payload)
    assert response.status_code == 201
    body = response.json()
    detail = client.get(f"/suppliers/{body['id']}")
    assert detail.status_code == 200 and detail.json() == body
    assert len(authentication) == 1  # The public GET did not resolve a session.
    with Session(create_engine_db) as session:
        value = find_active_detail(session, UUID(body['id']))
    assert body == SupplierResponse.from_read(value).model_dump(mode='json')
    assert body['version'] == 1 and body['deleted_at'] is None
    assert body['created_at'] == body['updated_at']
    assert body['location'] == {'latitude': 1.291876, 'longitude': 103.781234}
    assert_assignment_pairs(create_engine_db, [body['id']], set(payload['category_ids']))


@pytest.mark.parametrize('name', ['Display Name', '  Display Name  ', ' display NAME '])
def test_post_normalized_duplicate_ignores_area(post_client, create_engine_db, payload, name):
    client, authentication = post_client
    first = post_supplier(client, payload)
    assert first.status_code == 201
    before = supplier_snapshot(create_engine_db)
    duplicate = dict(payload, name=name, area='FASS', location={
        'latitude': '1.2918760', 'longitude': '103.7812340',
    })
    response = post_supplier(client, duplicate)
    assert response.status_code == 409
    assert response.json() == {'error': {
        'code': 'SUPPLIER_DUPLICATE',
        'message': 'An active supplier with this name and location already exists.',
    }}
    assert supplier_snapshot(create_engine_db) == before
    assert_assignment_pairs(create_engine_db, [first.json()['id']], set(payload['category_ids']))
    assert len(authentication) == 2


@pytest.mark.parametrize('difference', ['latitude', 'longitude', 'name'])
def test_post_allows_exactly_distinct_name_or_point(post_client, create_engine_db, payload, difference):
    client, _ = post_client
    first = post_supplier(client, payload)
    assert first.status_code == 201
    changed = deepcopy(payload)
    if difference == 'name':
        changed['name'] = 'Different name'
    else:
        changed['location'][difference] = {
            'latitude': '1.291876001', 'longitude': '103.781234001',
        }[difference]
    second = post_supplier(client, changed)
    assert second.status_code == 201
    original, distinct = first.json(), second.json()
    assert original['id'] != distinct['id']
    if difference == 'name':
        assert distinct['location'] == original['location']
        assert distinct['name'] != original['name']
    else:
        assert distinct['name'] == original['name']
        assert distinct['location'][difference] == float(changed['location'][difference])
        assert distinct['location'][difference] != original['location'][difference]
    assert client.get(f"/suppliers/{distinct['id']}").json() == distinct
    assert_assignment_pairs(create_engine_db, [original['id'], distinct['id']],
                            set(payload['category_ids']))


def test_post_deleted_match_preserves_history(post_client, create_engine_db, payload):
    client, _ = post_client
    first = post_supplier(client, payload)
    assert first.status_code == 201
    old_id = first.json()['id']
    with Session(create_engine_db) as session, session.begin():
        session.execute(update(Supplier).where(Supplier.id == UUID(old_id)).values(
            deleted_at=datetime.now(timezone.utc), version=7))
    old_suppliers, old_assignments = supplier_snapshot(create_engine_db)
    replacement = post_supplier(client, dict(payload, name=' DISPLAY NAME ', area='FASS'))
    assert replacement.status_code == 201
    new_id = replacement.json()['id']
    assert UUID(new_id).version == 4 and new_id != old_id
    saved_suppliers, saved_assignments = supplier_snapshot(create_engine_db)
    assert tuple(row for row in saved_suppliers if row.id == UUID(old_id)) == old_suppliers
    assert tuple(row for row in saved_assignments if row.supplier_id == UUID(old_id)) == old_assignments
    assert client.get(f'/suppliers/{old_id}').status_code == 404
    assert client.get(f'/suppliers/{new_id}').json() == replacement.json()
    assert_assignment_pairs(create_engine_db, [old_id, new_id], set(payload['category_ids']))


def test_post_failure_after_assignments_is_not_publicly_readable(
    post_client, create_engine_db, payload, monkeypatch,
):
    client, _ = post_client
    inserted = []
    original = suppliers.insert_category_assignments

    def fail_after_assignments(session, identity, category_ids):
        original(session, identity, category_ids)
        assert session.get(Supplier, identity) is not None
        assert session.scalar(text('SELECT count(*) FROM supplier_category')) == 2
        inserted.append(identity)
        raise database_error(OperationalError, '08006')

    with monkeypatch.context() as patch:
        patch.setattr(suppliers, 'insert_category_assignments', fail_after_assignments)
        response = post_supplier(client, payload)
    assert response.status_code == 503
    assert response.json()['error']['code'] == 'DATABASE_UNAVAILABLE'
    identity, = inserted
    assert client.get(f'/suppliers/{identity}').status_code == 404
    assert client.get('/suppliers').json()['total'] == 0
    assert_assignment_pairs(create_engine_db, [], [])
    # A fresh HTTP request can create after the failed transaction was cleaned up.
    assert post_supplier(client, payload).status_code == 201


def wait_for_competing_transaction(engine, waiting_pid, blocking_pid):
    """Require an observed PostgreSQL transaction-ID lock, with a bounded deadline."""
    deadline = monotonic() + 10
    poll = Event()
    with engine.begin() as connection:
        connection.execute(text("SET LOCAL statement_timeout = '5s'"))
        while monotonic() < deadline:
            if connection.scalar(text(
                'SELECT :blocking = ANY(pg_blocking_pids(:waiting)) AND EXISTS ('
                "SELECT 1 FROM pg_locks WHERE pid = :waiting AND locktype = 'transactionid' "
                'AND NOT granted)'
            ), {'blocking': blocking_pid, 'waiting': waiting_pid}):
                return
            poll.wait(0.01)
    pytest.fail('The second POST did not wait for the first transaction')


@pytest.mark.parametrize('first_rolls_back', [False, True])
def test_post_concurrent_duplicate_waits_for_commit_or_rollback(
    post_client, create_engine_db, payload, monkeypatch, first_rolls_back,
):
    client, authentication = post_client
    inserted, release_first = Event(), Event()
    participants = Queue()
    insert = suppliers.insert_supplier
    assignments = suppliers.insert_category_assignments
    first_identity = []

    def record_connection(session, identity, values, timestamp):
        assert session.in_transaction()
        if values.name == 'Display Name':
            first_identity.append(identity)
        session.execute(text("SET LOCAL statement_timeout = '20s'"))
        session.execute(text("SET LOCAL lock_timeout = '15s'"))
        pid = session.scalar(text('SELECT pg_backend_pid()'))
        participants.put((session, pid, identity))
        insert(session, identity, values, timestamp)

    def pause_first_after_assignments(session, identity, category_ids):
        assignments(session, identity, category_ids)
        if identity == first_identity[0]:
            inserted.set()
            assert release_first.wait(15), 'First POST was not released'
            if first_rolls_back:
                # A real FK error after both supplier and assignments were inserted.
                assignments(session, identity, (uuid4(),))

    monkeypatch.setattr(suppliers, 'insert_supplier', record_connection)
    monkeypatch.setattr(suppliers, 'insert_category_assignments', pause_first_after_assignments)
    contender = dict(payload, name=' DISPLAY NAME ', area='FASS')
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(post_supplier, client, payload)
        try:
            assert inserted.wait(10), 'First POST did not reach its assignment barrier'
            first_session, first_pid, first_id = participants.get(timeout=10)
            second = pool.submit(post_supplier, client, contender)
            second_session, second_pid, second_id = participants.get(timeout=10)
            assert first_session is not second_session and first_pid != second_pid
            assert first_id != second_id
            wait_for_competing_transaction(create_engine_db, second_pid, first_pid)
            assert not first.done() and not second.done()
        finally:
            release_first.set()
        first_response = first.result(timeout=20)
        second_response = second.result(timeout=20)
    assert not first_session.in_transaction() and not second_session.in_transaction()
    assert participants.empty()
    if first_rolls_back:
        assert first_response.status_code == 500
        assert second_response.status_code == 201
        winner, loser = second_response, first_id
    else:
        assert first_response.status_code == 201
        assert second_response.status_code == 409
        assert second_response.json()['error']['code'] == 'SUPPLIER_DUPLICATE'
        winner, loser = first_response, second_id
    assert client.get(f"/suppliers/{winner.json()['id']}").json() == winner.json()
    assert client.get(f'/suppliers/{loser}').status_code == 404
    assert_assignment_pairs(create_engine_db, [winner.json()['id']], set(payload['category_ids']))
    assert len(authentication) == 2
