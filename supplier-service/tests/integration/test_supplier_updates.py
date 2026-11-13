# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-10-01
# Scope: Writing implementation code; Boilerplate generation — write 44 update cases using existing disposable PostGIS fixtures, covering merged validation, omission/null behavior, scalar/category changes, no-op versions, refreshed relationships, concurrent state changes, duplicate renames, rollback, commit failures, and exact SQLSTATE classification. (ai-20261001-006)
# Author review: Keith confirmed review of the retained atomic update changes (ai-20261001-006).
# Scope: Writing implementation code; Boilerplate generation — extend the specified mounted PATCH and existing service tests with 13 real PostGIS cases, reuse disposable database and controlled authentication fixtures, track request-session cleanup, synchronize independent writes with bounded barriers and observed PostgreSQL locks, and verify complete winner state, rollback snapshots, stale/no-op behavior, canonical public reads, and deletion-race classification. (ai-20261001-008)
# Author review: Keith confirmed review of the retained concurrency and rollback tests (ai-20261001-008).
# Scope: Writing implementation code; Boilerplate generation — add 31 cases using existing isolated PostgreSQL/PostGIS fixtures, complete row and assignment snapshots, write-free repeated deletion, missing/stale failures, failure injection at lock/flush/commit, lock-release checks, and synchronized competing update/delete/rollback transactions with stale cached state. (ai-20261001-010)
# Author review: Keith confirmed review of the retained soft deletion changes (ai-20261001-010).
# Tool: Codex (model: GPT-6), date: 2026-10-01
# Scope: Writing implementation code; Boilerplate generation — add three mounted DELETE/PATCH contention cases using independent request sessions, bounded events, observed PostgreSQL blocking, complete winner snapshots, single deletion increments, conflict/not-found outcomes, and transaction/lock cleanup. (ai-20261001-013)
# Author review: Keith confirmed review of the retained lifecycle tests (ai-20261001-013).
# Details: ../../ai/usage-log.md; ai-20261001-006; ai-20261001-008; ai-20261001-010; ai-20261001-013

"""Atomic versioned updates against disposable, migrated PostGIS databases."""

from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from dataclasses import replace
from datetime import datetime, time, timezone
from queue import Queue
from threading import Event
from time import monotonic
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4

import pytest
from sqlalchemy import event, select, text, update
from sqlalchemy.exc import IntegrityError, OperationalError, ProgrammingError, TimeoutError
from sqlalchemy.orm import Session

from app.models import Category, Supplier, supplier_category
from app.repositories import suppliers as repository
from app.repositories.suppliers import find_active_detail
from app.schemas import SupplierPatch, SupplierResponse
from app.services import suppliers
from app.validation.errors import DomainValidationError
from tests.integration.test_supplier_creates import (
    ADMIN_HEADERS, create_engine_db, payload, post_client, supplier_snapshot,
)


@pytest.fixture
def saved(create_engine_db, payload):
    with Session(create_engine_db) as session:
        return suppliers.create_supplier(session, payload)


def read(engine, identity):
    with Session(engine) as session:
        return find_active_detail(session, identity)


@pytest.mark.parametrize('patch', [
    {}, {'name': 'Display Name'}, {'description': None},
    {'name': '  Renamed  ', 'area': ' FASS ', 'floor': '  '},
    {'opening_time': '22:00:00'}, {'closing_time': '09:00:00'},
    {'opening_time': None, 'closing_time': None}, SupplierPatch(description=None),
])
def test_scalar_updates_and_noops(create_engine_db, saved, patch):
    changes = patch.model_dump(exclude_unset=True) if isinstance(patch, SupplierPatch) else patch
    before = datetime.now(timezone.utc)
    with Session(create_engine_db) as session:
        commits = []
        event.listen(session, 'after_commit', lambda *_: commits.append(True))
        result = suppliers.update_supplier(session, saved.id, 1, patch)
        assert commits == [True]
        assert not session.in_transaction()
    expected = dict(changes)
    if 'name' in expected:
        expected['name'] = expected['name'].strip()
    if 'area' in expected:
        expected['area'] = expected['area'].strip()
    if 'floor' in expected:
        expected['floor'] = None
    for key in ('opening_time', 'closing_time'):
        if expected.get(key) is not None:
            expected[key] = time.fromisoformat(expected[key])
    if 'opening_time' in expected or 'closing_time' in expected:
        expected['closing_day_offset'] = None if expected.get('opening_time', saved.opening_time) is None else 1
    assert result == replace(saved, **expected, version=2, updated_at=result.updated_at)
    assert before <= result.updated_at <= datetime.now(timezone.utc)
    assert result.updated_at > saved.updated_at
    assert read(create_engine_db, saved.id) == result


def test_category_replacement_refreshes_cached_relationship(create_engine_db, saved):
    with Session(create_engine_db) as session:
        ids = list(session.scalars(select(Category.id)))
    selected = next(identity for identity in ids if identity not in {c.id for c in saved.categories})
    with Session(create_engine_db, expire_on_commit=False) as session:
        cached = session.get(Supplier, saved.id)
        assert len(cached.categories) == 2
        session.commit()
        result = suppliers.update_supplier(session, saved.id, 1, {'category_ids': [str(selected)] * 3})
    assert [c.id for c in result.categories] == [selected]
    assert result == replace(saved, categories=result.categories, version=2, updated_at=result.updated_at)
    assert read(create_engine_db, saved.id) == result


@pytest.mark.parametrize('patch', [
    {'name': None}, {'area': None}, {'category_ids': None}, {'category_ids': []},
    {'location': None}, {'id': None}, {'created_at': None}, {'updated_at': None},
    {'deleted_at': None}, {'version': 2}, {'closing_day_offset': 1}, {'unknown': True},
    {'opening_time': None}, {'closing_time': None}, {'closing_time': 'bad'},
    {'description': 'change', 'name': None, 'closing_time': None},
])
def test_rejected_patch_preserves_entire_record(create_engine_db, saved, patch):
    with Session(create_engine_db) as session:
        with pytest.raises(DomainValidationError):
            suppliers.update_supplier(session, saved.id, 1, patch)
        assert not session.in_transaction()
    assert read(create_engine_db, saved.id) == saved


def test_unknown_category_positions_and_aggregate_errors(create_engine_db, saved):
    known, unknown = str(saved.categories[0].id), str(uuid4())
    with Session(create_engine_db) as session:
        with pytest.raises(DomainValidationError) as caught:
            suppliers.update_supplier(session, saved.id, 1, {
                'category_ids': [known, unknown, known, unknown], 'name': None,
                'opening_time': None,
            })
    issues = [(issue.fields[0], issue.code) for issue in caught.value.errors]
    assert ('category_ids.1', 'UNKNOWN_CATEGORY') in issues
    assert ('category_ids.3', 'UNKNOWN_CATEGORY') in issues
    assert any(code == 'INCOMPLETE_SCHEDULE' for _, code in issues)
    assert any(field == 'name' for field, _ in issues)
    assert read(create_engine_db, saved.id) == saved


@pytest.mark.parametrize('deleted', [False, True])
def test_unavailable_record(create_engine_db, saved, deleted):
    identity = uuid4()
    if deleted:
        identity = saved.id
        with create_engine_db.begin() as connection:
            connection.execute(update(Supplier).where(Supplier.id == identity).values(deleted_at=datetime.now(timezone.utc)))
    with Session(create_engine_db) as session:
        with pytest.raises(suppliers.SupplierNotFound):
            suppliers.update_supplier(session, identity, 1, {})
        assert not session.in_transaction()


def test_stale_version_preserves_record(create_engine_db, saved):
    with Session(create_engine_db) as session:
        with pytest.raises(suppliers.SupplierVersionConflict):
            suppliers.update_supplier(session, saved.id, 7, {'name': 'Changed', 'category_ids': [saved.categories[0].id]})
    assert read(create_engine_db, saved.id) == saved


@pytest.mark.parametrize('delete_record', [False, True])
def test_conditional_failure_uses_fresh_active_state(create_engine_db, saved, monkeypatch, delete_record):
    original = suppliers.update_active_supplier
    def competing_write(session, identity, version, scalars, timestamp):
        with create_engine_db.begin() as connection:
            changes = {'deleted_at': timestamp} if delete_record else {'version': 2}
            connection.execute(update(Supplier).where(Supplier.id == identity).values(**changes))
        return original(session, identity, version, scalars, timestamp)
    monkeypatch.setattr(suppliers, 'update_active_supplier', competing_write)
    error = suppliers.SupplierNotFound if delete_record else suppliers.SupplierVersionConflict
    with Session(create_engine_db) as session:
        with pytest.raises(error):
            suppliers.update_supplier(session, saved.id, 1, {'description': 'Lost'})
    if not delete_record:
        assert read(create_engine_db, saved.id) == replace(saved, version=2)


def test_duplicate_rename_rolls_back(create_engine_db, saved, payload):
    with Session(create_engine_db) as session:
        other = suppliers.create_supplier(session, dict(payload, name='Other'))
        with pytest.raises(suppliers.SupplierDuplicate):
            suppliers.update_supplier(session, other.id, 1, {'name': ' DISPLAY NAME ', 'description': None})
        assert not session.in_transaction()
    assert read(create_engine_db, other.id) == other
    assert read(create_engine_db, saved.id) == saved


def test_assignment_failure_rolls_back_scalar_write(create_engine_db, saved, monkeypatch):
    original = suppliers.replace_category_assignments
    def fail(session, identity, ids):
        original(session, identity, (uuid4(),))
    monkeypatch.setattr(suppliers, 'replace_category_assignments', fail)
    with Session(create_engine_db) as session:
        with pytest.raises(IntegrityError):
            suppliers.update_supplier(session, saved.id, 1, {'name': 'Changed', 'category_ids': [saved.categories[0].id]})
    assert read(create_engine_db, saved.id) == saved


@pytest.mark.parametrize('error,expected', [
    (TimeoutError('secret'), suppliers.SupplierUpdateUnavailable),
    (OperationalError('secret', {}, Exception('secret')), suppliers.SupplierUpdateUnavailable),
    (ProgrammingError('secret', {}, Exception('secret')), ProgrammingError),
    (IntegrityError('secret', {}, Exception('secret')), IntegrityError),
])
def test_commit_failure_never_returns_or_retries(create_engine_db, saved, monkeypatch, error, expected):
    with Session(create_engine_db) as session:
        commit = Mock(side_effect=error)
        def fail_commit(*_):
            commit()
        event.listen(session, 'before_commit', fail_commit)
        with pytest.raises(expected):
            suppliers.update_supplier(session, saved.id, 1, {'name': 'Changed'})
        commit.assert_called_once()
        assert not session.in_transaction()
    assert read(create_engine_db, saved.id) == saved


def test_scalar_and_category_update_together(create_engine_db, saved):
    with Session(create_engine_db) as session:
        result = suppliers.update_supplier(session, saved.id, 1, {
            'name': '  Together  ', 'description': None,
            'category_ids': [saved.categories[0].id] * 2,
        })
    assert result == replace(
        saved, name='Together', description=None, categories=(saved.categories[0],),
        version=2, updated_at=result.updated_at,
    )
    assert read(create_engine_db, saved.id) == result


@pytest.mark.parametrize('state,constraint,expected', [
    ('23505', 'uq_supplier_active_name_location', suppliers.SupplierDuplicate),
    ('23505', 'other_constraint', IntegrityError),
    ('23503', 'uq_supplier_active_name_location', IntegrityError),
    ('08006', None, suppliers.SupplierUpdateUnavailable),
    ('53000', None, suppliers.SupplierUpdateUnavailable),
    ('57P01', None, suppliers.SupplierUpdateUnavailable),
])
def test_exact_database_failure_classification(state, constraint, expected):
    from types import SimpleNamespace
    class DatabaseFailure(Exception):
        sqlstate = state
        diag = SimpleNamespace(constraint_name=constraint)
    session = Mock()
    transaction = session.begin.return_value
    transaction.__enter__ = Mock(side_effect=IntegrityError('secret', {}, DatabaseFailure('secret')))
    transaction.__exit__ = Mock(return_value=False)
    with pytest.raises(expected) as caught:
        suppliers.update_supplier(session, uuid4(), 1, {})
    if expected is not IntegrityError:
        assert 'secret' not in str(caught.value)
        assert caught.value.__cause__ is None


@pytest.fixture
def patch_client(post_client, monkeypatch):
    """Reuse mounted routes and real storage; track every request session's cleanup."""
    client, authentication = post_client
    factory = client.app.state.session_factory
    sessions = []

    @contextmanager
    def tracked_session():
        with factory() as session:
            monkeypatch.setattr(session, 'close', Mock(wraps=session.close))
            sessions.append(session)
            yield session

    monkeypatch.setattr(client.app.state, 'session_factory', tracked_session)
    try:
        yield SimpleNamespace(client=client, authentication=authentication, sessions=sessions)
    finally:
        for session in sessions:
            session.close.assert_called_once_with()
            assert not session.in_transaction()


def patch_supplier(client, identity, version, body):
    return client.patch(f'/suppliers/{identity}', params={'expected_version': version},
                        headers=ADMIN_HEADERS, json=body)


def assert_public_saved(client, engine, identity, response):
    """Compare the committed HTTP representation with two independent fresh reads."""
    assert response.status_code == 200, response.text
    detail = client.get(f'/suppliers/{identity}')
    assert detail.status_code == 200
    assert detail.json() == response.json()
    value = read(engine, identity)
    assert response.json() == SupplierResponse.from_read(value).model_dump(mode='json')
    assert list(value.categories) == sorted(value.categories, key=lambda c: (c.name, c.id))
    return value


def assert_version_conflict(response):
    assert response.status_code == 409
    assert response.json() == {'error': {
        'code': 'VERSION_CONFLICT',
        'message': 'This supplier has changed. Reload it before trying again.',
    }}


def wait_for_patch_lock(engine, waiting_pid, blocking_pid):
    """Observe a real database lock; polling is bounded and never establishes ordering."""
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
    pytest.fail('PATCH did not wait for the competing PostgreSQL transaction')


@pytest.mark.parametrize('first_choice', [0, 1])
def test_patch_concurrent_same_version_has_one_complete_winner(
    patch_client, create_engine_db, saved, monkeypatch, first_choice,
):
    client = patch_client.client
    applied, release = Event(), Event()
    participants, replacements, outcomes = Queue(), Queue(), Queue()
    conditional = suppliers.update_active_supplier
    assignments = suppliers.replace_category_assignments
    contenders = [
        {'name': 'Winner A', 'description': None, 'opening_time': '22:00:00',
         'category_ids': [str(saved.categories[0].id)]},
        {'name': 'Winner B', 'description': 'Other contender', 'closing_time': '09:00:00',
         'category_ids': [str(saved.categories[1].id)]},
    ]
    first_body, second_body = contenders[first_choice], contenders[1 - first_choice]

    def record_conditional(session, identity, version, scalars, timestamp):
        session.execute(text("SET LOCAL statement_timeout = '20s'"))
        session.execute(text("SET LOCAL lock_timeout = '15s'"))
        pid = session.scalar(text('SELECT pg_backend_pid()'))
        # Both transactions see the original committed version before their writes.
        stored_version = session.scalar(select(Supplier.version).where(Supplier.id == identity))
        participants.put((session, pid, stored_version, version))
        result = conditional(session, identity, version, scalars, timestamp)
        outcomes.put((scalars['name'], result))
        return result

    def hold_after_replacement(session, identity, category_ids):
        assignments(session, identity, category_ids)
        replacements.put(category_ids)
        applied.set()
        assert release.wait(15), 'Winning PATCH was not released'

    with monkeypatch.context() as patch:
        patch.setattr(suppliers, 'update_active_supplier', record_conditional)
        patch.setattr(suppliers, 'replace_category_assignments', hold_after_replacement)
        with ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(patch_supplier, client, saved.id, saved.version, first_body)
            try:
                assert applied.wait(10), 'First PATCH did not reach assignment barrier'
                first_session, first_pid, first_seen, first_expected = participants.get(timeout=10)
                second = pool.submit(patch_supplier, client, saved.id, saved.version, second_body)
                second_session, second_pid, second_seen, second_expected = participants.get(timeout=10)
                assert first_session is not second_session and first_pid != second_pid
                assert first_seen == second_seen == first_expected == second_expected == saved.version
                wait_for_patch_lock(create_engine_db, second_pid, first_pid)
                assert not first.done() and not second.done()
            finally:
                # Release the worker even when an assertion or lock observation fails.
                release.set()
            winner, loser = first.result(timeout=20), second.result(timeout=20)
    assert_version_conflict(loser)
    value = assert_public_saved(client, create_engine_db, saved.id, winner)
    expected = {
        'name': first_body['name'], 'description': first_body['description'],
        'categories': (saved.categories[first_choice],), 'closing_day_offset': 1,
    }
    time_field = 'opening_time' if first_choice == 0 else 'closing_time'
    expected[time_field] = time.fromisoformat(first_body[time_field])
    assert value == replace(saved, **expected, version=saved.version + 1, updated_at=value.updated_at)
    assert value.updated_at > saved.updated_at
    assert replacements.get_nowait() == (saved.categories[first_choice].id,)
    assert replacements.empty() and participants.empty()
    assert {outcomes.get_nowait(), outcomes.get_nowait()} == {
        (first_body['name'], True), (second_body['name'], False),
    }
    assert outcomes.empty()
    assert len(patch_client.authentication) == 2  # Public GET remains anonymous.


@pytest.mark.parametrize('stale_body', [{'description': 'Different field'}, {'name': 'New name'}])
def test_patch_stale_different_or_equal_values_and_fresh_noops(
    patch_client, create_engine_db, saved, stale_body,
):
    client = patch_client.client
    initial = patch_supplier(client, saved.id, 1, {'name': 'New name'})
    assert initial.status_code == 200
    before = supplier_snapshot(create_engine_db)
    assert_version_conflict(patch_supplier(client, saved.id, 1, stale_body))
    assert supplier_snapshot(create_engine_db) == before
    previous = read(create_engine_db, saved.id)
    for body in ({'category_ids': [str(saved.categories[1].id)]}, {'name': 'New name'}, {}):
        response = patch_supplier(client, saved.id, previous.version, body)
        value = assert_public_saved(client, create_engine_db, saved.id, response)
        assert value == replace(previous, categories=(saved.categories[1],),
                                version=previous.version + 1, updated_at=value.updated_at)
        assert value.updated_at > previous.updated_at
        previous = value


@pytest.mark.parametrize('clear_schedule', [False, True])
def test_patch_committed_representation_matches_public_detail(
    patch_client, create_engine_db, saved, clear_schedule,
):
    body = {'name': '  Canonical Name  ', 'description': None, 'building': None,
            'floor': '  ', 'image_key': None,
            'category_ids': [str(c.id) for c in reversed(saved.categories)] * 2}
    body.update({'opening_time': None, 'closing_time': None} if clear_schedule
                else {'opening_time': '22:30:00'})
    response = patch_supplier(patch_client.client, saved.id, saved.version, body)
    value = assert_public_saved(patch_client.client, create_engine_db, saved.id, response)
    assert value == replace(saved, name='Canonical Name', description=None, building=None,
        floor=None, image_key=None, opening_time=None if clear_schedule else time(22, 30),
        closing_time=None if clear_schedule else saved.closing_time,
        closing_day_offset=None if clear_schedule else 1, version=2, updated_at=value.updated_at)
    assert len(patch_client.authentication) == 1


@pytest.mark.parametrize('via_http', [False, True])
def test_patch_assignment_failure_restores_deleted_assignments_and_all_scalars(
    patch_client, create_engine_db, saved, monkeypatch, via_http,
):
    before = supplier_snapshot(create_engine_db)
    insert = repository.insert_category_assignments
    # Patch the repository insertion called AFTER replacement deleted the old set.
    observed = []
    body = {'name': 'Must roll back', 'description': None, 'opening_time': '22:00:00',
            'category_ids': [str(saved.categories[0].id)]}

    def fail_after_delete(session, identity, category_ids):
        row = session.execute(select(Supplier.name, Supplier.version, Supplier.updated_at,
            Supplier.opening_time, Supplier.closing_day_offset).where(Supplier.id == identity)).one()
        assert row.name == body['name'] and row.version == saved.version + 1
        assert row.updated_at > saved.updated_at
        assert row.opening_time == time(22) and row.closing_day_offset == 1
        assert list(session.scalars(select(supplier_category.c.category_id).where(
            supplier_category.c.supplier_id == identity))) == []
        observed.append(identity)
        # Make a partial replacement, then provoke a real unrelated FK violation.
        insert(session, identity, category_ids)
        insert(session, identity, (uuid4(),))

    with monkeypatch.context() as patch:
        patch.setattr(repository, 'insert_category_assignments', fail_after_delete)
        if via_http:
            response = patch_supplier(patch_client.client, saved.id, saved.version, body)
            assert response.status_code == 500
            assert response.text == 'Internal Server Error'
        else:
            with Session(create_engine_db) as session:
                with pytest.raises(IntegrityError) as caught:
                    suppliers.update_supplier(session, saved.id, saved.version, body)
                assert caught.value.orig.sqlstate == '23503'
                assert not session.in_transaction()
    assert observed == [saved.id]
    assert supplier_snapshot(create_engine_db) == before
    assert read(create_engine_db, saved.id) == saved
    assert patch_client.client.get(f'/suppliers/{saved.id}').json() == SupplierResponse.from_read(saved).model_dump(mode='json')
    # A new request can write normally after the failed transaction is cleaned up.
    assert patch_supplier(patch_client.client, saved.id, saved.version, {}).status_code == 200


def test_patch_duplicate_rename_rolls_back_all_requested_edits(
    patch_client, create_engine_db, saved, payload,
):
    with Session(create_engine_db) as session:
        other = suppliers.create_supplier(session, dict(payload, name='Other supplier'))
    before = supplier_snapshot(create_engine_db)
    response = patch_supplier(patch_client.client, other.id, other.version, {
        'name': '  DISPLAY NAME  ', 'description': None, 'area': 'FASS',
        'opening_time': '22:00:00', 'category_ids': [str(saved.categories[0].id)],
    })
    assert response.status_code == 409
    assert response.json() == {'error': {
        'code': 'SUPPLIER_DUPLICATE',
        'message': 'An active supplier with this name and location already exists.',
    }}
    assert supplier_snapshot(create_engine_db) == before
    assert read(create_engine_db, saved.id) == saved
    assert read(create_engine_db, other.id) == other


@pytest.mark.parametrize('state', ['missing', 'deleted', 'stale'])
def test_patch_not_found_and_stale_targets_preserve_database(
    patch_client, create_engine_db, saved, state,
):
    identity = uuid4() if state == 'missing' else saved.id
    if state == 'deleted':
        with create_engine_db.begin() as connection:
            connection.execute(update(Supplier).where(Supplier.id == identity).values(
                deleted_at=datetime.now(timezone.utc)))
    before = supplier_snapshot(create_engine_db)
    response = patch_supplier(patch_client.client, identity, 9, {'description': 'Rejected'})
    if state == 'stale':
        assert_version_conflict(response)
    else:
        assert response.status_code == 404
        assert response.json() == {'error': {'code': 'SUPPLIER_NOT_FOUND', 'message': 'Supplier not found.'}}
    assert supplier_snapshot(create_engine_db) == before


def test_patch_concurrent_deletion_classifies_failed_conditional_write_as_not_found(
    patch_client, create_engine_db, saved, monkeypatch,
):
    before_rows, before_assignments = supplier_snapshot(create_engine_db)
    participant = Queue()
    conditional_results, active_results = [], []
    conditional = suppliers.update_active_supplier
    active = suppliers.active_supplier_exists

    def record_conditional(session, identity, version, scalars, timestamp):
        session.execute(text("SET LOCAL statement_timeout = '20s'"))
        session.execute(text("SET LOCAL lock_timeout = '15s'"))
        participant.put((session, session.scalar(text('SELECT pg_backend_pid()'))))
        result = conditional(session, identity, version, scalars, timestamp)
        conditional_results.append(result)
        return result

    def record_active(session, identity):
        result = active(session, identity)
        active_results.append(result)
        return result

    with monkeypatch.context() as patch:
        patch.setattr(suppliers, 'update_active_supplier', record_conditional)
        patch.setattr(suppliers, 'active_supplier_exists', record_active)
        with create_engine_db.connect() as deleting:
            transaction = deleting.begin()
            deleting_pid = deleting.scalar(text('SELECT pg_backend_pid()'))
            timestamp = datetime.now(timezone.utc)
            deleting.execute(update(Supplier).where(Supplier.id == saved.id).values(
                deleted_at=timestamp, updated_at=timestamp, version=saved.version + 1))
            with ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(patch_supplier, patch_client.client, saved.id, saved.version, {
                    'name': 'Lost to deletion', 'category_ids': [str(saved.categories[0].id)],
                })
                try:
                    request_session, request_pid = participant.get(timeout=10)
                    assert request_pid != deleting_pid
                    wait_for_patch_lock(create_engine_db, request_pid, deleting_pid)
                    assert not future.done()
                    transaction.commit()
                finally:
                    if transaction.is_active:
                        transaction.rollback()
                response = future.result(timeout=20)
    assert response.status_code == 404
    assert response.json() == {'error': {'code': 'SUPPLIER_NOT_FOUND', 'message': 'Supplier not found.'}}
    assert conditional_results == [False] and active_results == [False]
    assert not request_session.in_transaction()
    # Compare every column and assignment to the original plus deletion's exact edits.
    after_rows, after_assignments = supplier_snapshot(create_engine_db)
    assert [dict(row._mapping) for row in after_rows] == [
        {**dict(row._mapping), 'deleted_at': timestamp, 'updated_at': timestamp,
         'version': saved.version + 1} for row in before_rows
    ]
    assert after_assignments == before_assignments
    assert patch_client.client.get(f'/suppliers/{saved.id}').status_code == 404
    assert len(patch_client.authentication) == 1


def test_delete_preserves_columns_and_assignments_and_is_idempotent(create_engine_db, saved):
    before_rows, assignments = supplier_snapshot(create_engine_db)
    started = datetime.now(timezone.utc)
    with Session(create_engine_db) as session:
        commits = []
        event.listen(session, 'after_commit', lambda *_: commits.append(True))
        assert suppliers.delete_supplier(session, saved.id, 1) is None
        assert commits == [True]
        assert not session.in_transaction()
    rows, after_assignments = supplier_snapshot(create_engine_db)
    original, deleted = dict(before_rows[0]._mapping), dict(rows[0]._mapping)
    timestamp = deleted['deleted_at']
    assert timestamp.utcoffset().total_seconds() == 0
    assert started <= timestamp <= datetime.now(timezone.utc)
    assert deleted == dict(original, deleted_at=timestamp, updated_at=timestamp, version=2)
    assert after_assignments == assignments
    statements = []
    def record(_conn, _cursor, statement, *_):
        statements.append(statement.strip().split()[0].upper())
    event.listen(create_engine_db, 'before_cursor_execute', record)
    try:
        for version in (1, 2, 99):
            with Session(create_engine_db) as session:
                suppliers.delete_supplier(session, saved.id, version)
                assert not session.in_transaction()
    finally:
        event.remove(create_engine_db, 'before_cursor_execute', record)
    assert not {'UPDATE', 'INSERT', 'DELETE'} & set(statements)
    assert supplier_snapshot(create_engine_db) == (rows, assignments)


@pytest.mark.parametrize('missing', [False, True])
def test_delete_rejection_preserves_storage(create_engine_db, saved, missing):
    before = supplier_snapshot(create_engine_db)
    with Session(create_engine_db) as session:
        with pytest.raises(suppliers.SupplierNotFound if missing else suppliers.SupplierVersionConflict):
            suppliers.delete_supplier(session, uuid4() if missing else saved.id, 99)
        assert not session.in_transaction()
    assert supplier_snapshot(create_engine_db) == before
    with create_engine_db.begin() as connection:
        connection.execute(select(Supplier.id).where(Supplier.id == saved.id).with_for_update(nowait=True))


@pytest.mark.parametrize('stage', ['lock', 'flush', 'commit'])
@pytest.mark.parametrize('state,expected', [
    (None, suppliers.SupplierDeleteUnavailable),
    ('08006', suppliers.SupplierDeleteUnavailable),
    ('53000', suppliers.SupplierDeleteUnavailable),
    ('57P01', suppliers.SupplierDeleteUnavailable),
    ('40001', OperationalError),
    ('40P01', OperationalError),
    ('23503', OperationalError),
])
def test_delete_failure_boundary_and_rollback(create_engine_db, saved, monkeypatch, stage, state, expected):
    class DatabaseFailure(Exception):
        sqlstate = state
    error = OperationalError('private diagnostics', {}, DatabaseFailure('private diagnostics'))
    before = supplier_snapshot(create_engine_db)
    calls = Mock(side_effect=error)
    with Session(create_engine_db) as session:
        if stage == 'lock':
            monkeypatch.setattr(suppliers, 'lock_supplier', calls)
        else:
            event.listen(session, 'after_flush' if stage == 'flush' else 'before_commit', calls)
        with pytest.raises(expected) as caught:
            suppliers.delete_supplier(session, saved.id, 1)
        calls.assert_called_once()
        assert not session.in_transaction()
    if expected is suppliers.SupplierDeleteUnavailable:
        assert str(caught.value) == 'Supplier deletion is temporarily unavailable.'
        assert caught.value.__cause__ is None
    assert supplier_snapshot(create_engine_db) == before
    with create_engine_db.begin() as connection:
        connection.execute(select(Supplier.id).where(Supplier.id == saved.id).with_for_update(nowait=True))


@pytest.mark.parametrize('error,expected', [
    (TimeoutError('private'), suppliers.SupplierDeleteUnavailable),
    (ProgrammingError('private', {}, Exception('private')), ProgrammingError),
    (IntegrityError('private', {}, Exception('private')), IntegrityError),
    (RuntimeError('private'), RuntimeError),
])
def test_delete_commit_failure_never_returns_success(create_engine_db, saved, error, expected):
    before = supplier_snapshot(create_engine_db)
    with Session(create_engine_db) as session:
        fail = Mock(side_effect=error)
        event.listen(session, 'before_commit', fail)
        with pytest.raises(expected):
            suppliers.delete_supplier(session, saved.id, 1)
        fail.assert_called_once()
        assert not session.in_transaction()
    assert supplier_snapshot(create_engine_db) == before


@pytest.mark.parametrize('competing_action', ['update', 'delete', 'rollback'])
def test_delete_waits_and_refreshes_locked_state(create_engine_db, saved, monkeypatch, competing_action):
    waiting = Queue()
    original_lock = suppliers.lock_supplier
    def lock(session, identity):
        waiting.put(session.scalar(text('SELECT pg_backend_pid()')))
        return original_lock(session, identity)
    monkeypatch.setattr(suppliers, 'lock_supplier', lock)
    with Session(create_engine_db, expire_on_commit=False) as session:
        cached = session.get(Supplier, saved.id)
        session.commit()
        with create_engine_db.connect() as competitor:
            transaction = competitor.begin()
            pid = competitor.scalar(text('SELECT pg_backend_pid()'))
            timestamp = datetime.now(timezone.utc)
            changes = {'version': 2, 'updated_at': timestamp}
            if competing_action == 'delete':
                changes['deleted_at'] = timestamp
            competitor.execute(update(Supplier).where(Supplier.id == saved.id).values(**changes))
            with ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(suppliers.delete_supplier, session, saved.id, 1)
                try:
                    wait_for_patch_lock(create_engine_db, waiting.get(timeout=10), pid)
                    assert not future.done()
                finally:
                    if competing_action == 'rollback':
                        transaction.rollback()
                    else:
                        transaction.commit()
                if competing_action == 'update':
                    with pytest.raises(suppliers.SupplierVersionConflict):
                        future.result(timeout=10)
                else:
                    assert future.result(timeout=10) is None
        assert not session.in_transaction()
        assert cached.version == 2
    rows, assignments = supplier_snapshot(create_engine_db)
    stored = rows[0]._mapping
    assert stored['version'] == 2
    assert len(assignments) == len(saved.categories)
    if competing_action == 'update':
        assert stored['deleted_at'] is None
    elif competing_action == 'delete':
        assert stored['deleted_at'] == stored['updated_at'] == timestamp
    else:
        assert stored['deleted_at'] == stored['updated_at'] > timestamp


@pytest.mark.parametrize('first_action,second_action', [
    ('delete', 'delete'), ('patch', 'delete'), ('delete', 'patch'),
])
def test_mounted_delete_and_patch_contend_without_partial_mutation(
    patch_client, create_engine_db, saved, monkeypatch, first_action, second_action,
):
    """Hold the winning real write until PostgreSQL observes the second waiter."""
    client = patch_client.client
    before_rows, before_assignments = supplier_snapshot(create_engine_db)
    participants, winning_snapshots = Queue(), Queue()
    applied, release = Event(), Event()
    original_lock = suppliers.lock_supplier
    original_conditional = suppliers.update_active_supplier
    original_delete = suppliers.soft_delete_supplier
    original_assignments = suppliers.replace_category_assignments
    edits = {'name': 'Committed lifecycle edit', 'description': None,
             'category_ids': [str(saved.categories[1].id)]}

    def participant(session):
        session.execute(text("SET LOCAL statement_timeout = '20s'"))
        session.execute(text("SET LOCAL lock_timeout = '15s'"))
        participants.put((session, session.scalar(text('SELECT pg_backend_pid()'))))

    def lock(session, identity):
        participant(session)
        return original_lock(session, identity)

    def conditional(session, *args):
        participant(session)
        return original_conditional(session, *args)

    def hold_written_state(session):
        session.flush()
        winning_snapshots.put((
            tuple(session.execute(text('SELECT * FROM supplier ORDER BY id'))),
            tuple(session.execute(text(
                'SELECT * FROM supplier_category ORDER BY supplier_id, category_id'))),
        ))
        applied.set()
        assert release.wait(15), 'Winning mutation was not released'

    def delete(session, *args):
        original_delete(session, *args)
        hold_written_state(session)

    def assignments(session, *args):
        original_assignments(session, *args)
        hold_written_state(session)

    def request(action):
        if action == 'patch':
            return patch_supplier(client, saved.id, saved.version, edits)
        return client.delete(f'/suppliers/{saved.id}', headers=ADMIN_HEADERS,
                             params={'expected_version': saved.version})

    with monkeypatch.context() as patch:
        patch.setattr(suppliers, 'lock_supplier', lock)
        patch.setattr(suppliers, 'update_active_supplier', conditional)
        patch.setattr(suppliers, 'soft_delete_supplier', delete)
        patch.setattr(suppliers, 'replace_category_assignments', assignments)
        with ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(request, first_action)
            try:
                assert applied.wait(10), 'First mutation did not reach write barrier'
                first_session, first_pid = participants.get(timeout=10)
                second = pool.submit(request, second_action)
                second_session, second_pid = participants.get(timeout=10)
                assert first_session is not second_session and first_pid != second_pid
                wait_for_patch_lock(create_engine_db, second_pid, first_pid)
                assert not first.done() and not second.done()
            finally:
                release.set()
            winner, loser = first.result(timeout=20), second.result(timeout=20)

    assert winner.status_code == (200 if first_action == 'patch' else 204), winner.text
    if first_action == 'patch':
        assert_version_conflict(loser)
        value = assert_public_saved(client, create_engine_db, saved.id, winner)
        assert value == replace(saved, name=edits['name'], description=None,
                                categories=(saved.categories[1],), version=saved.version + 1,
                                updated_at=value.updated_at)
    else:
        assert winner.content == b''
        if second_action == 'delete':
            assert loser.status_code == 204 and loser.content == b''
        else:
            assert loser.status_code == 404
            assert loser.json() == {'error': {'code': 'SUPPLIER_NOT_FOUND',
                                               'message': 'Supplier not found.'}}
        rows, assignments_after = supplier_snapshot(create_engine_db)
        timestamp = rows[0]._mapping['deleted_at']
        assert timestamp is not None
        assert dict(rows[0]._mapping) == dict(before_rows[0]._mapping,
            deleted_at=timestamp, updated_at=timestamp, version=saved.version + 1)
        assert assignments_after == before_assignments
        assert client.get(f'/suppliers/{saved.id}').status_code == 404

    # Exactly one complete write occurred; the losing request changed nothing.
    assert supplier_snapshot(create_engine_db) == winning_snapshots.get_nowait()
    assert winning_snapshots.empty() and participants.empty()
    assert not first_session.in_transaction() and not second_session.in_transaction()
    with create_engine_db.begin() as connection:
        connection.execute(select(Supplier.id).where(
            Supplier.id == saved.id).with_for_update(nowait=True))
    with Session(create_engine_db) as session:
        value = suppliers.get_admin_supplier(session, saved.id)
    response = client.get(f'/admin/suppliers/{saved.id}', headers=ADMIN_HEADERS)
    assert response.status_code == 200
    assert response.json() == SupplierResponse.from_read(value).model_dump(mode='json')
