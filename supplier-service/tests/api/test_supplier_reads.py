# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-30
# Scope: Writing implementation code — write detached-value serialization tests for complete and nullable suppliers, ordered categories/pages, coordinates, schedules, timestamps, version, and stored-value preservation.
# Scope: Writing implementation code — extend isolated HTTP tests for supplier reads, query/path validation, safe errors, session cleanup, and production route exclusion. (ai-20260930-017)
# Scope: Writing implementation code — extend isolated HTTP coverage for controlled choices, database-free areas, category failures and cleanup, all four adapters, and production exclusion. (ai-20260930-018)
# Scope: Writing implementation code — adapt tests to production router registration without duplicate mounting and add recording MockTransport coverage for credential-independent public responses, authentication outages, database-free areas, and public OpenAPI declarations. (ai-20260930-022)
# Tool: Codex (model: GPT-6), date: 2026-10-01
# Scope: Writing implementation code — count GET registrations specifically so POST sharing the supplier path is not treated as a duplicate read route. (ai-20261001-003)
# Author review: Keith confirmed review of the response serialization tests (ai-20260930-016). Keith also confirmed review of the supplier HTTP tests (ai-20260930-017). Keith also confirmed review of the reference-data HTTP tests (ai-20260930-018). Keith confirmed review of public-read registration changes (ai-20260930-022).
# Author review: Keith confirmed review of all retained changes for ai-20261001-003.
# Tool: Codex (model: GPT-6), date: 2026-10-01
# Scope: Writing implementation code — reuse controlled authentication/session fixtures and add mounted administrator read cases for default and explicit statuses, canonical detail/page responses, combined filters, invalid queries/UUIDs, missing records, authorization failures, safe database errors, and OpenAPI/public status isolation. (ai-20261001-012)
# Author review: Keith confirmed review of the retained administrator-read changes (ai-20261001-012).
# Details: ../../ai/usage-log.md; ai-20260930-016; ai-20260930-017; ai-20260930-018; ai-20260930-022; ai-20261001-003; ai-20261001-012

"""Detached response serialization and isolated supplier HTTP reads."""

import json
from contextlib import contextmanager
from unittest.mock import MagicMock
from dataclasses import replace
from datetime import datetime, time, timedelta, timezone
from uuid import UUID

import httpx
import pytest
from fastapi import Request
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.api.test_supplier_creates import AUTH, PROFILE, create_client

from app.db import get_db
from app.main import create_app
from app.clients.user_service import UserServiceClient
from app.services import suppliers as supplier_service

from app.repositories.suppliers import CategoryRead, SupplierPage, SupplierRead
from app.schemas import CategoryResponse, SupplierPageResponse, SupplierResponse


@pytest.fixture
def supplier():
    return SupplierRead(
        id=UUID(int=1), name="Campus Café", area="Science",
        description="Near entrance", building="S16", floor="1", image_key="cafe.png",
        opening_time=time(10), closing_time=time(19, 30), closing_day_offset=0,
        created_at=datetime(2026, 9, 26, 2, tzinfo=timezone.utc),
        updated_at=datetime(2026, 9, 27, 10, 15, 32, 123456,
                            tzinfo=timezone(timedelta(hours=8))),
        deleted_at=None, version=7, latitude=1.296123456, longitude=103.773987654,
        categories=(CategoryRead(UUID(int=3), "Food"), CategoryRead(UUID(int=2), "Coffee")),
    )


def serialize(value):
    response = SupplierResponse.from_read(value)
    result = json.loads(response.model_dump_json())
    assert result == response.model_dump(mode="json")
    return result


def test_complete_supplier(supplier):
    assert serialize(supplier) == {
        "id": str(UUID(int=1)), "name": "Campus Café", "area": "Science",
        "location": {"latitude": 1.296123456, "longitude": 103.773987654},
        "categories": [{"id": str(UUID(int=3)), "name": "Food"},
                       {"id": str(UUID(int=2)), "name": "Coffee"}],
        "description": "Near entrance", "building": "S16", "floor": "1",
        "image_key": "cafe.png", "opening_time": "10:00:00", "closing_time": "19:30:00",
        "closing_day_offset": 0, "created_at": "2026-09-26T02:00:00Z",
        "updated_at": "2026-09-27T10:15:32.123456+08:00", "deleted_at": None, "version": 7,
    }


def test_nullable_supplier(supplier):
    fields = ("description", "building", "floor", "image_key", "opening_time",
              "closing_time", "closing_day_offset", "deleted_at")
    result = serialize(replace(supplier, **dict.fromkeys(fields)))
    for field in fields:
        assert field in result
        assert result[field] is None


@pytest.mark.parametrize("opening,closing,offset,expected", [
    (time(18), time(2), 1, ("18:00:00", "02:00:00")),
    (time(10), time(10), 1, ("10:00:00", "10:00:00")),
    (time(10, 0, 1, 123456), time(19, 30, 59, 1), 0,
     ("10:00:01.123456", "19:30:59.000001")),
])
def test_schedule_precision(supplier, opening, closing, offset, expected):
    result = serialize(replace(supplier, opening_time=opening, closing_time=closing,
                               closing_day_offset=offset))
    assert (result["opening_time"], result["closing_time"]) == expected
    assert result["closing_day_offset"] == offset


def test_stored_values_are_not_normalized(supplier):
    value = replace(supplier, name=" Café ", area="Historical area", description="  ",
                    building=" S16 ", floor=" 1 ", image_key=" original.png ",
                    closing_day_offset=1)
    result = serialize(value)
    for field in ("name", "area", "description", "building", "floor", "image_key",
                  "closing_day_offset"):
        assert result[field] == getattr(value, field)


def test_deletion_timestamp(supplier):
    deleted = supplier.updated_at + timedelta(days=1)
    result = serialize(replace(supplier, deleted_at=deleted, version=8))
    assert result["deleted_at"] == "2026-09-28T10:15:32.123456+08:00"
    assert result["version"] == 8


def test_category(supplier):
    category = supplier.categories[0]
    assert json.loads(CategoryResponse.from_read(category).model_dump_json()) == {
        "id": str(category.id), "name": category.name,
    }


def test_nonempty_page(supplier):
    second = replace(supplier, id=UUID(int=4), name="Another supplier")
    page = SupplierPage(items=(supplier, second), total=42, limit=2, offset=10)
    assert json.loads(SupplierPageResponse.from_read(page).model_dump_json()) == {
        "items": [serialize(supplier), serialize(second)], "total": 42, "limit": 2, "offset": 10,
    }
    assert page.items == (supplier, second)
    assert isinstance(page.items, tuple)
    assert isinstance(supplier.categories, tuple)


@pytest.mark.parametrize("total,offset", [(0, 0), (42, 100)])
def test_empty_page(total, offset):
    page = SupplierPage(items=(), total=total, limit=20, offset=offset)
    assert json.loads(SupplierPageResponse.from_read(page).model_dump_json()) == {
        "items": [], "total": total, "limit": 20, "offset": offset,
    }


@pytest.fixture
def read_client(settings, monkeypatch, supplier, auth_boundary):
    engine = MagicMock()
    session = MagicMock(spec=Session)
    opened = []

    @contextmanager
    def session_factory():
        opened.append(session)
        try:
            yield session
        finally:
            session.close()

    def override_db(request: Request):
        yield from get_db(request)

    monkeypatch.setattr("app.main.create_db_engine", lambda settings: engine)
    monkeypatch.setattr("app.main.create_session_factory", lambda engine: session_factory)
    detail = MagicMock(return_value=supplier)
    listing = MagicMock(return_value=SupplierPage((supplier,), 1, 20, 0))
    monkeypatch.setattr(supplier_service, "get_supplier", detail)
    monkeypatch.setattr(supplier_service, "list_suppliers", listing)
    application = create_app(settings)
    original = application.dependency_overrides.copy()
    application.dependency_overrides[get_db] = override_db
    try:
        with TestClient(application) as client:
            yield client, session, detail, listing
    finally:
        application.dependency_overrides.clear()
        application.dependency_overrides.update(original)
        assert application.dependency_overrides == original
        assert session.close.call_count == len(opened)
        assert all(call[0] == "close" for call in session.mock_calls)
        engine.connect.assert_not_called()
        engine.raw_connection.assert_not_called()
        engine.dispose.assert_called_once_with()


@pytest.mark.parametrize("nullable", [False, True])
def test_detail_http(read_client, supplier, nullable):
    client, session, detail, listing = read_client
    if nullable:
        supplier = replace(supplier, description=None, building=None, floor=None,
                           image_key=None, opening_time=None, closing_time=None,
                           closing_day_offset=None)
    detail.return_value = supplier
    response = client.get(f"/suppliers/{supplier.id}")
    assert response.status_code == 200
    assert response.json() == serialize(supplier)
    detail.assert_called_once_with(session, supplier.id)
    listing.assert_not_called()
    session.close.assert_called_once_with()


def test_listing_defaults_and_order(read_client, supplier):
    client, session, detail, listing = read_client
    second = replace(supplier, id=UUID(int=9), name="Second")
    listing.return_value = SupplierPage((supplier, second), 42, 20, 0)
    response = client.get("/suppliers")
    assert response.status_code == 200
    assert response.json() == {
        "items": [serialize(supplier), serialize(second)], "total": 42, "limit": 20, "offset": 0,
    }
    listing.assert_called_once_with(session, area=None, category_ids=[], limit=20, offset=0)
    detail.assert_not_called()


@pytest.mark.parametrize("limit,offset", [(1, 0), (100, 1000)])
def test_filters_and_boundary_pagination(read_client, limit, offset):
    client, session, _, listing = read_client
    categories = [UUID(int=3), UUID(int=3), UUID(int=2)]
    listing.return_value = SupplierPage((), 42, limit, offset)
    response = client.get("/suppliers", params=[
        ("area", " USC/UHC "), ("limit", str(limit)), ("offset", str(offset)),
        *(("category_id", str(value)) for value in categories),
    ])
    assert response.status_code == 200
    assert response.json() == {"items": [], "total": 42, "limit": limit, "offset": offset}
    listing.assert_called_once_with(
        session, area=" USC/UHC ", category_ids=categories, limit=limit, offset=offset,
    )


def test_unknown_category_is_not_rejected(read_client):
    client, session, _, listing = read_client
    unknown = UUID(int=999)
    listing.return_value = SupplierPage((), 0, 20, 0)
    response = client.get("/suppliers", params={"category_id": str(unknown)})
    assert response.status_code == 200
    assert response.json() == {"items": [], "total": 0, "limit": 20, "offset": 0}
    listing.assert_called_once_with(session, area=None, category_ids=[unknown], limit=20, offset=0)


@pytest.mark.parametrize("field,value", [
    ("limit", "0"), ("limit", "101"), ("limit", "-1"), ("limit", "bad"),
    ("limit", "1.5"), ("limit", ""), ("limit", "true"),
    ("offset", "-1"), ("offset", "bad"), ("offset", "1.5"), ("offset", ""),
])
def test_invalid_pagination_never_calls_service(read_client, field, value):
    client, _, detail, listing = read_client
    response = client.get("/suppliers", params={field: value})
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert error["details"][0]["fields"] == [f"query.{field}"]
    detail.assert_not_called()
    listing.assert_not_called()


def test_invalid_categories_keep_original_positions(read_client):
    client, _, detail, listing = read_client
    response = client.get("/suppliers", params=[
        ("category_id", str(UUID(int=1))), ("category_id", str(UUID(int=1))),
        ("category_id", "private-invalid"), ("category_id", "private-invalid"),
        ("limit", "bad"), ("offset", "-1"),
    ])
    assert response.status_code == 422
    assert set(response.json()) == {"error"}
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert {(tuple(issue["fields"]), issue["code"]) for issue in error["details"]} == {
        (("query.category_id.2",), "INVALID_UUID"),
        (("query.category_id.3",), "INVALID_UUID"),
        (("query.limit",), "INVALID_INPUT"), (("query.offset",), "INVALID_INPUT"),
    }
    assert "private-invalid" not in response.text
    detail.assert_not_called()
    listing.assert_not_called()


def test_invalid_detail_uuid_never_calls_service(read_client):
    client, _, detail, listing = read_client
    response = client.get("/suppliers/not-a-uuid")
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert error["details"][0]["fields"] == ["path.id"]
    assert error["details"][0]["code"] == "INVALID_UUID"
    detail.assert_not_called()
    listing.assert_not_called()


@pytest.mark.parametrize("identity", [UUID(int=100), UUID(int=101)])
def test_unavailable_identity_has_same_safe_404(read_client, identity):
    # Both missing and deleted identities are represented as None by the service.
    client, session, detail, _ = read_client
    detail.return_value = None
    response = client.get(f"/suppliers/{identity}")
    assert response.status_code == 404
    assert response.json() == {"error": {
        "code": "SUPPLIER_NOT_FOUND", "message": "Supplier not found.",
    }}
    session.close.assert_called_once_with()


@pytest.mark.parametrize("path", ["/suppliers", f"/suppliers/{UUID(int=1)}"])
def test_service_unavailable_is_safe(read_client, path):
    client, session, detail, listing = read_client
    error = supplier_service.SupplierReadUnavailable()
    error.args = ("SQL credentials private diagnostics",)
    detail.side_effect = listing.side_effect = error
    response = client.get(path)
    assert response.status_code == 503
    assert response.json() == {"error": {
        "code": "DATABASE_UNAVAILABLE", "message": "Supplier details are temporarily unavailable.",
    }}
    session.close.assert_called_once_with()


@pytest.mark.parametrize("path", ["/suppliers", f"/suppliers/{UUID(int=1)}"])
def test_programming_defects_propagate(read_client, path):
    client, session, detail, listing = read_client
    detail.side_effect = listing.side_effect = RuntimeError("programming defect")
    with pytest.raises(RuntimeError, match="programming defect"):
        client.get(path)
    session.close.assert_called_once_with()


def test_production_reads_and_probes_are_public_and_registered_once(settings):
    application = create_app(settings)
    public = {"/suppliers", "/suppliers/{id}", "/categories", "/areas", "/health", "/ready"}
    paths = application.openapi()["paths"]
    assert "security" not in application.openapi()
    for path in public:
        assert sum(route.path == path and 'GET' in route.methods
                   for route in application.routes) == 1
        assert "security" not in paths[path]["get"]


@pytest.mark.parametrize("empty", [False, True])
def test_categories_http_preserves_service_choices(read_client, monkeypatch, empty):
    client, session, detail, listing = read_client
    # Printing/Shopping are service-provided choices absent from the supplier fixture.
    choices = () if empty else (
        CategoryRead(UUID(int=2), "Coffee"), CategoryRead(UUID(int=3), "Food"),
        CategoryRead(UUID(int=4), "Printing"), CategoryRead(UUID(int=5), "Shopping"),
    )
    read = MagicMock(return_value=choices)
    monkeypatch.setattr(supplier_service, "list_categories", read)
    response = client.get("/categories")
    assert response.status_code == 200
    assert response.json() == [{"id": str(item.id), "name": item.name} for item in choices]
    read.assert_called_once_with(session)
    detail.assert_not_called()
    listing.assert_not_called()
    session.close.assert_called_once_with()


def test_category_unavailable_matches_supplier_envelope(read_client, monkeypatch):
    client, session, _, listing = read_client
    error = supplier_service.SupplierReadUnavailable()
    error.args = ("SQL credentials and private diagnostics",)
    read = MagicMock(side_effect=error)
    monkeypatch.setattr(supplier_service, "list_categories", read)
    response = client.get("/categories")
    assert response.status_code == 503
    assert response.json() == {"error": {
        "code": "DATABASE_UNAVAILABLE", "message": "Supplier details are temporarily unavailable.",
    }}
    read.assert_called_once_with(session)
    session.close.assert_called_once_with()
    listing.side_effect = error
    supplier_response = client.get("/suppliers")
    assert supplier_response.status_code == response.status_code
    assert supplier_response.json() == response.json()


def test_category_programming_error_propagates(read_client, monkeypatch):
    client, session, _, _ = read_client
    read = MagicMock(side_effect=RuntimeError("programming defect"))
    monkeypatch.setattr(supplier_service, "list_categories", read)
    with pytest.raises(RuntimeError, match="programming defect"):
        client.get("/categories")
    session.close.assert_called_once_with()


@pytest.mark.parametrize("authorization", [None, "Bearer revoked", "Basic malformed"])
def test_areas_http_works_without_any_database_access(read_client, monkeypatch, authorization):
    client, session, detail, listing = read_client

    def forbidden_db():
        raise AssertionError("Database dependency must not run")

    dependency = MagicMock(side_effect=forbidden_db)

    def override_db():
        return dependency()

    client.app.dependency_overrides[get_db] = override_db
    factory = MagicMock(side_effect=AssertionError("Session must not open"))
    monkeypatch.setattr(client.app.state, "session_factory", factory)
    engine = client.app.state.engine
    engine.connect.side_effect = AssertionError("Connection must not open")
    engine.raw_connection.side_effect = AssertionError("Connection must not open")
    session.execute.side_effect = AssertionError("SQL must not execute")
    read = MagicMock(wraps=supplier_service.list_areas)
    monkeypatch.setattr(supplier_service, "list_areas", read)
    headers = {} if authorization is None else {"Authorization": authorization}
    response = client.get("/areas", headers=headers)
    assert response.status_code == 200
    assert response.json() == [
        "Engineering", "FASS", "SoC", "BIZ", "PGP", "Science", "USC/UHC",
        "UTown", "YIH", "YST", "KR/NUH",
    ]
    read.assert_called_once_with()
    dependency.assert_not_called()
    factory.assert_not_called()
    assert session.mock_calls == []
    detail.assert_not_called()
    listing.assert_not_called()


def test_all_four_read_adapters_share_isolated_app(read_client, monkeypatch, supplier):
    client, session, detail, listing = read_client
    categories = MagicMock(return_value=supplier.categories)
    monkeypatch.setattr(supplier_service, "list_categories", categories)
    for path in ("/suppliers", f"/suppliers/{supplier.id}", "/categories", "/areas"):
        assert client.get(path).status_code == 200
    detail.assert_called_once_with(session, supplier.id)
    listing.assert_called_once_with(session, area=None, category_ids=[], limit=20, offset=0)
    categories.assert_called_once_with(session)
    assert session.close.call_count == 3
    assert {"/suppliers", "/suppliers/{id}", "/categories", "/areas"} <= set(
        client.app.openapi()["paths"]
    )


@pytest.fixture
def auth_boundary(settings, monkeypatch):
    requests = []
    profile = {"id": str(UUID(int=42)), "role": "admin", "status": "active"}

    def reply(request):
        requests.append(request)
        return httpx.Response(200, json=profile)

    transport_handler = MagicMock(side_effect=reply)
    upstream = UserServiceClient(settings, transport=httpx.MockTransport(transport_handler))
    resolve = MagicMock(wraps=upstream.resolve_identity)
    monkeypatch.setattr(upstream, "resolve_identity", resolve)
    monkeypatch.setattr("app.main.UserServiceClient", lambda settings: upstream)
    try:
        yield transport_handler
    finally:
        upstream.close()
        resolve.assert_not_called()
        transport_handler.assert_not_called()
        assert requests == []


@pytest.mark.parametrize("authorization", [
    None, "Bearer valid-user", "Bearer valid-admin", "Basic malformed",
    "Bearer ", "Bearer expired", "Bearer revoked",
])
@pytest.mark.parametrize("outage", [False, True])
def test_public_read_contracts_ignore_session_state(
    read_client, auth_boundary, monkeypatch, supplier, authorization, outage,
):
    client, session, _, _ = read_client
    if outage:
        auth_boundary.side_effect = httpx.ConnectError("User Service unavailable")
    categories = MagicMock(return_value=supplier.categories)
    monkeypatch.setattr(supplier_service, "list_categories", categories)
    headers = {} if authorization is None else {"Authorization": authorization}
    expected = {
        "/suppliers": {"items": [serialize(supplier)], "total": 1, "limit": 20, "offset": 0},
        f"/suppliers/{supplier.id}": serialize(supplier),
        "/categories": [{"id": str(item.id), "name": item.name} for item in supplier.categories],
        "/areas": ["Engineering", "FASS", "SoC", "BIZ", "PGP", "Science", "USC/UHC",
                   "UTown", "YIH", "YST", "KR/NUH"],
    }
    for path, body in expected.items():
        response = client.get(path, headers=headers)
        assert response.status_code == 200
        assert response.json() == body
    assert session.close.call_count == 3


@pytest.fixture
def admin_read_client(create_client, monkeypatch, supplier):
    create_client.detail = MagicMock(return_value=supplier)
    create_client.listing = MagicMock(return_value=SupplierPage((supplier,), 1, 20, 0))
    monkeypatch.setattr(supplier_service, "get_admin_supplier", create_client.detail)
    monkeypatch.setattr(supplier_service, "list_admin_suppliers", create_client.listing)
    return create_client


@pytest.mark.parametrize("status", [None, "active", "deleted", "all"])
def test_admin_status_and_canonical_page(admin_read_client, supplier, status):
    ctx = admin_read_client
    value = replace(supplier, deleted_at=supplier.updated_at) if status == "deleted" else supplier
    ctx.listing.return_value = SupplierPage((value,), 1, 20, 0)
    response = ctx.client.get("/admin/suppliers", headers=AUTH,
                              params={} if status is None else {"status": status})
    assert response.status_code == 200
    assert response.json() == {"items": [serialize(value)], "total": 1, "limit": 20, "offset": 0}
    ctx.listing.assert_called_once_with(ctx.sessions[0], status=status or "active",
                                       area=None, category_ids=[], limit=20, offset=0)


@pytest.mark.parametrize("total,offset", [(0, 0), (3, 100)])
def test_admin_combined_filters_empty_pages(admin_read_client, total, offset):
    ctx = admin_read_client
    category = UUID(int=3)
    ctx.listing.return_value = SupplierPage((), total, 100, offset)
    response = ctx.client.get("/admin/suppliers", headers=AUTH, params=[
        ("status", "all"), ("area", "Science"), ("category_id", str(category)),
        ("category_id", str(category)), ("limit", 100), ("offset", offset),
    ])
    assert response.status_code == 200
    assert response.json() == {"items": [], "total": total, "limit": 100, "offset": offset}
    ctx.listing.assert_called_once_with(ctx.sessions[0], status="all", area="Science",
                                       category_ids=[category, category], limit=100, offset=offset)


@pytest.mark.parametrize("query", ["status=", "status=ALL", "status=unknown", "status= active",
                                   "limit=0", "limit=101", "offset=-1", "category_id=bad"])
def test_admin_invalid_query(admin_read_client, query):
    response = admin_read_client.client.get("/admin/suppliers?" + query, headers=AUTH)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    field = query.split("=")[0]
    assert response.json()["error"]["details"][0]["fields"][0].startswith(f"query.{field}")
    admin_read_client.listing.assert_not_called()


@pytest.mark.parametrize("deleted", [False, True])
def test_admin_detail_retains_complete_value(admin_read_client, supplier, deleted):
    ctx = admin_read_client
    value = replace(supplier, deleted_at=supplier.updated_at) if deleted else supplier
    ctx.detail.return_value = value
    response = ctx.client.get(f"/admin/suppliers/{supplier.id}", headers=AUTH)
    assert response.status_code == 200
    assert response.json() == serialize(value)
    ctx.detail.assert_called_once_with(ctx.sessions[0], supplier.id)


def test_admin_missing_and_malformed(admin_read_client):
    ctx = admin_read_client
    ctx.detail.return_value = None
    response = ctx.client.get(f"/admin/suppliers/{UUID(int=999)}", headers=AUTH)
    assert response.status_code == 404
    assert response.json() == {"error": {"code": "SUPPLIER_NOT_FOUND", "message": "Supplier not found."}}
    ctx.detail.reset_mock()
    response = ctx.client.get("/admin/suppliers/bad", headers=AUTH)
    assert response.status_code == 422
    assert response.json()["error"]["details"][0]["fields"] == ["path.id"]
    ctx.detail.assert_not_called()


@pytest.mark.parametrize("path", ["/admin/suppliers", f"/admin/suppliers/{UUID(int=1)}"])
@pytest.mark.parametrize("failure,code,status", [
    ("missing", "AUTHENTICATION_REQUIRED", 401),
    ("malformed", "AUTHENTICATION_REQUIRED", 401),
    ("revoked", "AUTHENTICATION_REQUIRED", 401),
    ("user", "FORBIDDEN", 403),
    ("outage", "AUTHENTICATION_UNAVAILABLE", 503),
    ("timeout", "AUTHENTICATION_UNAVAILABLE", 503),
])
def test_admin_read_authorization(admin_read_client, path, failure, code, status):
    ctx = admin_read_client
    headers = AUTH
    if failure == "missing":
        headers = {}
    elif failure == "malformed":
        headers = {"Authorization": "Basic bad"}
    elif failure == "timeout":
        ctx.reply.side_effect = httpx.ReadTimeout("secret")
    else:
        ctx.reply.return_value = {
            "revoked": httpx.Response(401, text="secret"),
            "user": httpx.Response(200, json={**PROFILE, "role": "user"}),
            "outage": httpx.Response(503, text="secret"),
        }[failure]
    response = ctx.client.get(path, headers=headers)
    assert response.status_code == status
    assert response.json()["error"]["code"] == code
    assert "secret" not in response.text
    ctx.detail.assert_not_called()
    ctx.listing.assert_not_called()
    ctx.factory.assert_not_called()


@pytest.mark.parametrize("detail", [False, True])
def test_admin_safe_database_failure(admin_read_client, detail):
    ctx = admin_read_client
    target = ctx.detail if detail else ctx.listing
    target.side_effect = supplier_service.SupplierReadUnavailable()
    path = f"/admin/suppliers/{UUID(int=1)}" if detail else "/admin/suppliers"
    response = ctx.client.get(path, headers=AUTH)
    assert response.status_code == 503
    assert response.json() == {"error": {"code": "DATABASE_UNAVAILABLE",
        "message": "Supplier details are temporarily unavailable."}}


def test_admin_openapi_security_and_public_status_isolation(admin_read_client, monkeypatch):
    ctx = admin_read_client
    paths = ctx.client.app.openapi()["paths"]
    for path in ("/admin/suppliers", "/admin/suppliers/{id}"):
        assert paths[path]["get"]["security"] == [{"HTTPBearer": []}]
    for path in ("/suppliers", "/suppliers/{id}"):
        assert not paths[path]["get"].get("security")
    status = next(p for p in paths["/admin/suppliers"]["get"]["parameters"] if p["name"] == "status")
    assert status["schema"]["enum"] == ["active", "deleted", "all"]
    assert status["schema"]["default"] == "active"
    assert "status" not in {p["name"] for p in paths["/suppliers"]["get"]["parameters"]}
    public = MagicMock(return_value=SupplierPage((), 0, 20, 0))
    monkeypatch.setattr(supplier_service, "list_suppliers", public)
    assert ctx.client.get("/suppliers?status=all").status_code == 200
    public.assert_called_once_with(ctx.sessions[0], area=None, category_ids=[], limit=20, offset=0)
    ctx.listing.assert_not_called()
    ctx.reply.assert_not_called()
