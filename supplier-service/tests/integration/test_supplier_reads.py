# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-30
# Scope: Writing implementation code — test active/deleted/missing identities, category and scalar preservation, asymmetric PostGIS coordinates, detached eager reads, pending state, seed identity compatibility, and simulated safe availability failures and programming errors.
# Scope: Writing implementation code — extend PostGIS coverage for filtering, deterministic pagination, totals, repeated categories, fresh-session bounded query growth, unchanged stored data, invalid pagination before repository access, and shared failure behavior. (ai-20260930-014)
# Scope: Writing implementation code — test migrated and unassigned/deleted-only categories, ordering, immutable results, no writes, exact database-free area choices, zero SQL for areas, and safe category failure handling. (ai-20260930-015)
# Author review: Keith confirmed review of this file.
# Tool: Codex (model: GPT-6), date: 2026-10-01
# Scope: Writing implementation code; Refactoring and documentation improvements — extend existing PostGIS fixtures for retained active/deleted details, all status views, combined filters, duplicate category selections, totals, bounded and empty pages, invalid filters before queries, and administrator safe/unexpected failure behavior; update the module docstring. (ai-20261001-012)
# Author review: Keith confirmed review of the retained administrator-read changes (ai-20261001-012).
# Tool: Codex (model: GPT-6), date: 2026-10-01
# Scope: Writing implementation code; Boilerplate generation — reuse real-commit and controlled authentication fixtures for mounted creation/deletion, public exclusion, complete administrator history and status pages, and stale repeat deletion with unchanged database snapshots. (ai-20261001-013)
# Author review: Keith confirmed review of the retained lifecycle tests (ai-20261001-013).
# Details: ../../ai/usage-log.md; ai-20260930-013; ai-20260930-014; ai-20260930-015; ai-20261001-012; ai-20261001-013

"""Public and administrator reads on PostGIS and simulated availability failures."""

from dataclasses import asdict
from datetime import datetime, time, timezone
from traceback import format_exception
from unittest.mock import Mock
from uuid import uuid4

import pytest
from geoalchemy2.elements import WKTElement
from sqlalchemy import event, select
from sqlalchemy.exc import DBAPIError, OperationalError, ProgrammingError, TimeoutError
from sqlalchemy.orm import Session

from app.models import Category, Supplier
from app.repositories.suppliers import find_identity
from app.services import suppliers

# Use the real-commit fixture and tracked mounted-route sessions for lifecycle reads.
from tests.integration.test_supplier_creates import (
    ADMIN_HEADERS, create_engine_db, payload, post_client, supplier_snapshot,
)
from tests.integration.test_supplier_updates import patch_client


def persist(session, *, nullable=False, deleted=False):
    now = datetime(2026, 9, 30, 1, 2, 3, tzinfo=timezone.utc)
    categories = list(session.scalars(select(Category).order_by(Category.name).limit(2)))
    assert len(categories) == 2
    supplier = Supplier(
        id=uuid4(), name="Detail fixture", area="Science",
        location=WKTElement("POINT(103.781234 1.291876)", srid=4326),
        description=None if nullable else "Description",
        building=None if nullable else "Building", floor=None if nullable else "B1",
        image_key=None if nullable else "supplier/example.jpg",
        opening_time=None if nullable else time(22, 30),
        closing_time=None if nullable else time(2, 15),
        closing_day_offset=None if nullable else 1,
        created_at=now, updated_at=now, deleted_at=now if deleted else None,
        version=7, categories=categories,
    )
    session.add(supplier)
    session.flush()
    return supplier


@pytest.mark.parametrize("nullable", [False, True])
@pytest.mark.parametrize("admin,deleted", [(False, False), (True, False), (True, True)])
def test_active_detail_is_complete_and_detached(db_connection, nullable, admin, deleted):
    with Session(db_connection) as session:
        supplier = persist(session, nullable=nullable, deleted=deleted)
        supplier_id = supplier.id
        expected = {name: getattr(supplier, name) for name in (
            "id", "name", "area", "description", "building", "floor", "image_key",
            "opening_time", "closing_time", "closing_day_offset", "created_at",
            "updated_at", "deleted_at", "version",
        )}
        categories = {(category.id, category.name) for category in supplier.categories}
        session.expunge_all()
        statements = []

        def track(connection, cursor, statement, parameters, context, executemany):
            statements.append(statement)

        event.listen(db_connection, "before_cursor_execute", track)
        try:
            # Reads must not flush even invalid pending caller changes.
            pending = Supplier(name="Pending incomplete supplier")
            session.add(pending)
            result = (suppliers.get_admin_supplier if admin else suppliers.get_supplier)(session, supplier_id)
            assert pending in session.new
            assert session.in_transaction()
            assert len(statements) == 2  # Supplier/coordinates, then categories.
            assert all(statement.lstrip().upper().startswith("SELECT") for statement in statements)
        finally:
            event.remove(db_connection, "before_cursor_execute", track)
    assert result is not None
    assert {key: asdict(result)[key] for key in expected} == expected
    assert {(category.id, category.name) for category in result.categories} == categories
    assert result.latitude == pytest.approx(1.291876, abs=1e-9)
    assert result.longitude == pytest.approx(103.781234, abs=1e-9)


def test_deleted_and_missing_are_absent_but_seed_identity_survives(db_connection):
    with Session(db_connection) as session:
        supplier = persist(session, deleted=True)
        assert suppliers.get_supplier(session, supplier.id) is None
        assert suppliers.get_supplier(session, uuid4()) is None
        identity = find_identity(session, supplier.id)
        assert identity is not None
        assert identity.latitude == pytest.approx(1.291876)
        assert identity.longitude == pytest.approx(103.781234)


def database_error(error_type, state=None, *, invalidated=False):
    original = Exception("secret credentials and raw database message")
    original.sqlstate = state
    return error_type("SECRET SQL", {}, original, connection_invalidated=invalidated)


@pytest.mark.parametrize("failure", [
    TimeoutError("secret pool details"),
    database_error(OperationalError),
    database_error(OperationalError, "08006"),
    database_error(OperationalError, "53300"),
    database_error(OperationalError, "57P01"),
    database_error(DBAPIError, invalidated=True),
])
@pytest.mark.parametrize("listing", [False, True, "categories", "admin_detail", "admin_list"])
def test_availability_failure_is_safe(monkeypatch, failure, listing):
    target = ("find_admin_detail" if listing == "admin_detail"
              else "read_admin_suppliers" if listing == "admin_list"
              else "read_categories" if listing == "categories"
              else "list_active_suppliers" if listing else "find_active_detail")
    monkeypatch.setattr(suppliers, target, Mock(side_effect=failure))
    with pytest.raises(suppliers.SupplierReadUnavailable) as caught:
        if listing == "admin_detail":
            suppliers.get_admin_supplier(Mock(spec=Session), uuid4())
        elif listing == "admin_list":
            suppliers.list_admin_suppliers(Mock(spec=Session))
        elif listing == "categories":
            suppliers.list_categories(Mock(spec=Session))
        elif listing:
            suppliers.list_suppliers(Mock(spec=Session))
        else:
            suppliers.get_supplier(Mock(spec=Session), uuid4())
    assert str(caught.value) == "Supplier details are temporarily unavailable."
    assert caught.value.__cause__ is None
    rendered = "".join(format_exception(caught.value))
    assert "SECRET SQL" not in rendered
    assert "secret" not in rendered


@pytest.mark.parametrize("failure", [
    ValueError("mapping defect"),
    database_error(ProgrammingError, "42703"),
    database_error(OperationalError, "42883"),
    database_error(DBAPIError, "23514"),
])
@pytest.mark.parametrize("listing", [False, True, "categories", "admin_detail", "admin_list"])
def test_programming_and_other_database_errors_propagate(monkeypatch, failure, listing):
    target = ("find_admin_detail" if listing == "admin_detail"
              else "read_admin_suppliers" if listing == "admin_list"
              else "read_categories" if listing == "categories"
              else "list_active_suppliers" if listing else "find_active_detail")
    monkeypatch.setattr(suppliers, target, Mock(side_effect=failure))
    with pytest.raises(type(failure)) as caught:
        if listing == "admin_detail":
            suppliers.get_admin_supplier(Mock(spec=Session), uuid4())
        elif listing == "admin_list":
            suppliers.list_admin_suppliers(Mock(spec=Session))
        elif listing == "categories":
            suppliers.list_categories(Mock(spec=Session))
        elif listing:
            suppliers.list_suppliers(Mock(spec=Session))
        else:
            suppliers.get_supplier(Mock(spec=Session), uuid4())
    assert caught.value is failure


@pytest.fixture
def listing_data(db_connection):
    """Persist in deliberately unsorted order, then discard the identity map."""
    from uuid import UUID

    now = datetime(2026, 9, 30, tzinfo=timezone.utc)
    with Session(db_connection) as session:
        categories = list(session.scalars(select(Category).order_by(Category.name).limit(3)))
        assert len(categories) == 3
        category_ids = tuple(category.id for category in categories)
        # IDs 2 and 3 have the same name but different points and areas.
        specs = [
            (4, "Zulu", "Science", (2,), False),
            (3, "Same", "Arts", (1,), False),
            (5, "Deleted", "Science", (0, 1), True),
            (2, "Same", "Science", (0, 1, 2), False),
            (1, "Alpha", "Science", (0,), False),
        ]
        for number, name, area, assignments, deleted in specs:
            session.add(Supplier(
                id=UUID(int=number), name=name, area=area,
                location=WKTElement(f"POINT({103 + number / 100} 1.29)", srid=4326),
                created_at=now, updated_at=now, version=1,
                deleted_at=now if deleted else None,
                categories=[categories[index] for index in assignments],
            ))
        session.flush()
    return category_ids


def page_ids(page):
    return [item.id.int for item in page.items]


def test_listing_defaults_order_and_boundaries(db_connection, listing_data):
    with Session(db_connection) as session:
        page = suppliers.list_suppliers(session)
        assert (page.total, page.limit, page.offset) == (4, 20, 0)
        assert page_ids(page) == [1, 2, 3, 4]
        assert page_ids(suppliers.list_suppliers(session, limit=1)) == [1]
        assert page_ids(suppliers.list_suppliers(session, limit=2, offset=1)) == [2, 3]
        assert page_ids(suppliers.list_suppliers(session, limit=1, offset=2)) == [3]
        assert page_ids(suppliers.list_suppliers(session, limit=100)) == [1, 2, 3, 4]
        for offset in (4, 100):
            empty = suppliers.list_suppliers(session, limit=100, offset=offset)
            assert empty.items == ()
            assert (empty.total, empty.limit, empty.offset) == (4, 100, offset)


def test_listing_filters_and_totals(db_connection, listing_data):
    first, second, third = listing_data
    cases = [
        ({"category_ids": ()}, [1, 2, 3, 4]),
        ({"area": "Science"}, [1, 2, 4]),
        ({"area": "Sci"}, []),
        ({"area": "science"}, []),
        ({"category_ids": (first, second)}, [1, 2, 3]),
        ({"category_ids": (second, first, second, first)}, [1, 2, 3]),
        ({"category_ids": (uuid4(),)}, []),
        ({"category_ids": (second, uuid4())}, [2, 3]),
        ({"area": "Science", "category_ids": (first, second)}, [1, 2]),
        ({"area": "Arts", "category_ids": (first,)}, []),
    ]
    for filters, expected in cases:
        with Session(db_connection) as session:
            page = suppliers.list_suppliers(session, **filters)
            assert page_ids(page) == expected
            assert page.total == len(expected)
            empty = suppliers.list_suppliers(session, offset=20, **filters)
            assert empty.items == () and empty.total == len(expected)
    with Session(db_connection) as session:
        page = suppliers.list_suppliers(session, category_ids=(second,), limit=1)
        assert page_ids(page) == [2] and page.total == 2
    # Access all categories and coordinates after closing the session.
    assert {category.id for category in page.items[0].categories} == {first, second, third}
    assert all(category.name for category in page.items[0].categories)
    assert page.items[0].latitude == pytest.approx(1.29)
    assert page.items[0].longitude == pytest.approx(103.02)


@pytest.mark.parametrize("limit", [1, 2, 20, 100])
def test_listing_query_growth_and_no_writes(db_connection, listing_data, limit):
    from sqlalchemy import text

    def snapshot():
        return tuple(tuple(db_connection.execute(text(
            f"SELECT * FROM {table} ORDER BY 1, 2"
        ))) for table in ("supplier", "category", "supplier_category"))

    before = snapshot()
    statements = []

    def track(connection, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(db_connection, "before_cursor_execute", track)
    try:
        with Session(db_connection) as session:
            assert not session.identity_map
            pending = Supplier(name="Unflushed incomplete supplier")
            session.add(pending)
            page = suppliers.list_suppliers(session, limit=limit)
            assert pending in session.new
            assert session.in_transaction()
        assert len(page.items) == min(limit, 4)
        assert len(statements) == 3  # Count, suppliers with coordinates, categories.
        assert all(statement.lstrip().upper().startswith("SELECT") for statement in statements)
        assert len(asdict(page)["items"]) == min(limit, 4)
    finally:
        event.remove(db_connection, "before_cursor_execute", track)
    assert snapshot() == before


@pytest.mark.parametrize("pagination,fields", [
    ({"limit": 0}, ("query.limit",)),
    ({"limit": -1}, ("query.limit",)),
    ({"limit": 101}, ("query.limit",)),
    ({"offset": -1}, ("query.offset",)),
    ({"limit": 0, "offset": -1}, ("query.limit", "query.offset")),
    ({"limit": True}, ("query.limit",)),
    ({"limit": 1.5}, ("query.limit",)),
    ({"limit": "20"}, ("query.limit",)),
    ({"offset": False}, ("query.offset",)),
    ({"offset": 0.5}, ("query.offset",)),
    ({"offset": None}, ("query.offset",)),
])
def test_invalid_pagination_never_queries(monkeypatch, pagination, fields):
    from app.validation.errors import DomainValidationError

    repository = Mock()
    session = Mock(spec=Session)
    monkeypatch.setattr(suppliers, "list_active_suppliers", repository)
    with pytest.raises(DomainValidationError) as caught:
        suppliers.list_suppliers(session, **pagination)
    assert tuple(issue.fields[0] for issue in caught.value.errors) == fields
    assert all(issue.code == "INVALID_PAGINATION" for issue in caught.value.errors)
    repository.assert_not_called()
    assert session.mock_calls == []


@pytest.mark.parametrize("assigned", [False, True])
def test_controlled_categories_are_complete_and_read_only(db_connection, assigned):
    from dataclasses import FrozenInstanceError
    from sqlalchemy import text

    with Session(db_connection) as session:
        if assigned:
            # These two categories have only deleted assignments; others have none.
            persist(session, deleted=True)
        expected = tuple(session.execute(
            select(Category.id, Category.name).order_by(Category.name, Category.id)
        ))
        assert {name for _, name in expected} == {"Food", "Coffee", "Shopping", "Printing"}
        session.expunge_all()

        def snapshot():
            return tuple(tuple(db_connection.execute(text(
                f"SELECT * FROM {table} ORDER BY 1, 2"
            ))) for table in ("category", "supplier", "supplier_category"))

        before = snapshot()
        statements = []

        def track(connection, cursor, statement, parameters, context, executemany):
            statements.append(statement)

        event.listen(db_connection, "before_cursor_execute", track)
        try:
            pending = Category(name="Must not be inserted")
            session.add(pending)
            result = suppliers.list_categories(session)
            assert pending in session.new
            assert session.in_transaction()
            assert len(statements) == 1
            assert statements[0].lstrip().upper().startswith("SELECT")
            assert "ORDER BY category.name, category.id" in statements[0]
        finally:
            event.remove(db_connection, "before_cursor_execute", track)
        assert snapshot() == before
    assert tuple((item.id, item.name) for item in result) == expected
    assert isinstance(result, tuple)
    with pytest.raises(FrozenInstanceError):
        result[0].name = "Changed"


def test_areas_are_exact_immutable_and_database_independent(monkeypatch):
    from sqlalchemy import Engine
    from app.validation.vocabulary import APPROVED_AREAS

    def reject_connection(*args, **kwargs):
        pytest.fail("Area reads must not open a database connection")

    monkeypatch.setattr(Engine, "connect", reject_connection)
    areas = suppliers.list_areas()
    assert areas == (
        "Engineering", "FASS", "SoC", "BIZ", "PGP", "Science",
        "USC/UHC", "UTown", "YIH", "YST", "KR/NUH",
    )
    assert isinstance(areas, tuple)
    with pytest.raises(TypeError):
        areas[0] = "Changed"
    assert suppliers.list_areas() == APPROVED_AREAS == areas


def test_area_access_executes_no_sql(db_connection):
    def reject_sql(*args, **kwargs):
        pytest.fail("Area reads must not execute SQL")

    event.listen(db_connection, "before_cursor_execute", reject_sql)
    try:
        assert len(suppliers.list_areas()) == 11
    finally:
        event.remove(db_connection, "before_cursor_execute", reject_sql)


@pytest.mark.parametrize("status,expected", [("active", [1, 2, 3, 4]),
                                             ("deleted", [5]), ("all", [1, 5, 2, 3, 4])])
def test_admin_filtered_pages(db_connection, listing_data, status, expected):
    first, second, third = listing_data
    with Session(db_connection) as session:
        assert page_ids(suppliers.list_admin_suppliers(session)) == [1, 2, 3, 4]
        for filters, ids in [({}, expected),
                            ({"area": "Science", "category_ids": (first, second, first)},
                             [i for i in expected if i in (1, 2, 5)]),
                            ({"category_ids": (uuid4(),)}, []),
                            ({"area": "missing"}, [])]:
            for limit, offset in [(20, 0), (1, 0), (1, 1), (100, 100)]:
                page = suppliers.list_admin_suppliers(session, status=status,
                                                      limit=limit, offset=offset, **filters)
                assert page_ids(page) == ids[offset:offset + limit]
                assert (page.total, page.limit, page.offset) == (len(ids), limit, offset)
        assert suppliers.get_admin_supplier(session, uuid4()) is None
        assert page_ids(suppliers.list_suppliers(session)) == [1, 2, 3, 4]


@pytest.mark.parametrize("filters", [{"status": "bad"}, {"limit": 0}, {"limit": 101},
                                     {"offset": -1}])
def test_admin_invalid_filters_before_query(monkeypatch, filters):
    from app.validation.errors import DomainValidationError
    repository = Mock()
    monkeypatch.setattr(suppliers, "read_admin_suppliers", repository)
    with pytest.raises(DomainValidationError):
        suppliers.list_admin_suppliers(Mock(spec=Session), **filters)
    repository.assert_not_called()


def test_mounted_create_delete_retains_admin_history(patch_client, create_engine_db, payload):
    client = patch_client.client
    created = client.post('/suppliers', headers=ADMIN_HEADERS, json=payload)
    assert created.status_code == 201
    original = created.json()
    identity = original['id']
    before_rows, before_assignments = supplier_snapshot(create_engine_db)
    response = client.delete(f'/suppliers/{identity}', headers=ADMIN_HEADERS,
                             params={'expected_version': original['version']})
    assert response.status_code == 204 and response.content == b''
    deleted = client.get(f'/admin/suppliers/{identity}', headers=ADMIN_HEADERS)
    assert deleted.status_code == 200
    retained = deleted.json()
    assert retained['deleted_at'] is not None
    assert retained == {**original, 'deleted_at': retained['deleted_at'],
                        'updated_at': retained['deleted_at'], 'version': original['version'] + 1}
    rows, assignments = supplier_snapshot(create_engine_db)
    assert assignments == before_assignments
    timestamp = rows[0]._mapping['deleted_at']
    assert dict(rows[0]._mapping) == dict(before_rows[0]._mapping,
        deleted_at=timestamp, updated_at=timestamp, version=original['version'] + 1)
    assert client.get(f'/suppliers/{identity}').json() == {
        'error': {'code': 'SUPPLIER_NOT_FOUND', 'message': 'Supplier not found.'}}
    assert client.get(f'/suppliers/{identity}').status_code == 404
    for path in ('/suppliers', '/suppliers?status=all', '/admin/suppliers',
                 '/admin/suppliers?status=active'):
        response = client.get(path, headers=ADMIN_HEADERS if path.startswith('/admin') else {})
        assert response.status_code == 200
        assert response.json() == {'items': [], 'total': 0, 'limit': 20, 'offset': 0}
    for status in ('deleted', 'all'):
        response = client.get('/admin/suppliers', headers=ADMIN_HEADERS, params={'status': status})
        assert response.status_code == 200
        assert response.json() == {'items': [retained], 'total': 1, 'limit': 20, 'offset': 0}
    snapshot = supplier_snapshot(create_engine_db)
    repeated = client.delete(f'/suppliers/{identity}', headers=ADMIN_HEADERS,
                             params={'expected_version': original['version']})
    assert repeated.status_code == 204 and repeated.content == b''
    assert supplier_snapshot(create_engine_db) == snapshot
    assert client.get(f'/admin/suppliers/{identity}', headers=ADMIN_HEADERS).json() == retained
    with create_engine_db.begin() as connection:
        connection.execute(select(Supplier.id).where(
            Supplier.id == identity).with_for_update(nowait=True))
