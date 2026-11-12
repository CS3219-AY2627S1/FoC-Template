# AI Assistance Disclosure (contributor use):
# Tool: OpenAI Codex (model not recorded), dates: 2026-10-02–2026-10-22
# Scope: Implementation, debugging, refactoring, and test assistance for Order Service modules.
# Author review: I reviewed, adapted, and tested the code. Architecture and decision-rationale assistance is not attributed.

from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main.app import app
from main.database import Base, get_db
from main.get_errands import verified_claims
from main.models import Errand, ErrandStatus
from test.test_accept_errand import seed


@pytest.fixture
def endpoint():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    claims = {"sub": str(uuid4()), "type": "Student"}

    def test_db():
        with factory() as db:
            yield db

    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = test_db
    app.dependency_overrides[verified_claims] = lambda: claims
    try:
        with TestClient(app) as client:
            yield client, claims, factory
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)
        engine.dispose()


def get(client, **params):
    return client.get(
        "/errands", params=params,
        headers={"Authorization": "Bearer test-token"},
    )


def ids(response):
    assert response.status_code == 200
    return [item["id"] for item in response.json()["items"]]


def test_default_visibility_and_newest_first(endpoint):
    client, claims, factory = endpoint
    now = datetime.now(timezone.utc)
    open_errand = seed(factory, created_at=now - timedelta(hours=2))
    own = seed(factory, requester_id=UUID(claims["sub"]), status=ErrandStatus.FAILED,
               failure_reason="Missing items", created_at=now - timedelta(hours=1))
    assigned = seed(factory, status=ErrandStatus.ACCEPTED, courier_id=UUID(claims["sub"]), created_at=now)
    seed(factory, status=ErrandStatus.ACCEPTED, courier_id=uuid4())
    seed(factory, expires_at=now - timedelta(seconds=1))
    response = get(client)
    assert ids(response) == [str(assigned["id"]), str(own["id"]), str(open_errand["id"])]
    assert response.json()["total"] == 3


@pytest.mark.parametrize("actor", ["requester", "courier"])
@pytest.mark.parametrize("state", list(ErrandStatus))
def test_participants_can_view_all_statuses_and_full_details(endpoint, actor, state):
    client, claims, factory = endpoint
    changes = {
        "requester_id": UUID(claims["sub"]) if actor == "requester" else uuid4(),
        "courier_id": UUID(claims["sub"]) if actor == "courier" else uuid4(),
        "status": state,
        "expires_at": datetime.now(timezone.utc) - timedelta(hours=1),
        "accepted_at": datetime.now(timezone.utc) - timedelta(hours=2),
    }
    if state == ErrandStatus.FAILED:
        changes.update(failure_reason="Missing items", failed_at=datetime.now(timezone.utc))
    if state == ErrandStatus.COMPLETED:
        changes["completed_at"] = datetime.now(timezone.utc)
    if state == ErrandStatus.DELIVERED:
        changes["delivered_at"] = datetime.now(timezone.utc)
    target = seed(factory, **changes)
    response = get(client, errand_id=str(target["id"]))
    assert ids(response) == [str(target["id"])]
    body = response.json()["items"][0]
    assert body["status"] == state.value
    assert body["requester_id"] == str(changes["requester_id"])
    assert body["courier_id"] == str(changes["courier_id"])
    assert body["accepted_at"] is not None
    assert (body["delivered_at"] is not None) == (state == ErrandStatus.DELIVERED)
    assert body["failure_reason"] == changes.get("failure_reason")
    if state == ErrandStatus.COMPLETED:
        assert body["completed_at"] is not None


@pytest.mark.parametrize("state", [s for s in ErrandStatus if s != ErrandStatus.OPEN])
def test_unrelated_user_cannot_probe_private_errand_or_count(endpoint, state):
    client, _, factory = endpoint
    target = seed(factory, status=state, courier_id=uuid4(), failure_reason="Private reason" if state == ErrandStatus.FAILED else None)
    params = {"errand_id": str(target["id"]), "requester_id": str(target["requester_id"]),
              "courier_id": str(target["courier_id"]), "status": state.value}
    response = get(client, **params)
    assert response.status_code == 200
    assert response.json() == {"total": 0, "items": []}


@pytest.mark.parametrize("field", ["courier_id", "accepted_at", "delivered_at", "completed_at", "cancelled_at", "failed_at", "failure_reason"])
def test_inconsistent_open_private_fields_are_hidden_from_unrelated_users(endpoint, field):
    client, _, factory = endpoint
    value = uuid4() if field == "courier_id" else "Private reason" if field == "failure_reason" else datetime.now(timezone.utc)
    seed(factory, **{field: value})
    assert get(client).json() == {"total": 0, "items": []}


def test_public_open_returns_nullable_lifecycle_fields(endpoint):
    client, _, factory = endpoint
    target = seed(factory, delivery_floor="Level 3")
    response = get(client)
    assert ids(response) == [str(target["id"])]
    body = response.json()["items"][0]
    assert body["delivery_floor"] == "Level 3"
    for field in ["courier_id", "accepted_at", "delivered_at", "completed_at", "cancelled_at", "failed_at", "failure_reason"]:
        assert body[field] is None


def test_admin_sees_all_states_and_overdue_records(endpoint):
    client, claims, factory = endpoint
    claims["type"] = "Administrator"
    for state in ErrandStatus:
        seed(factory, status=state, courier_id=uuid4() if state != ErrandStatus.OPEN else None,
             expires_at=datetime.now(timezone.utc) - timedelta(hours=1))
    response = get(client)
    assert response.status_code == 200
    assert response.json()["total"] == len(ErrandStatus)
    assert {item["status"] for item in response.json()["items"]} == {s.value for s in ErrandStatus}


@pytest.mark.parametrize("role", [None, "Student", "administrator", "Unknown"])
def test_only_exact_verified_admin_role_bypasses_visibility(endpoint, role):
    client, claims, factory = endpoint
    if role is None:
        claims.pop("type")
    else:
        claims["type"] = role
    seed(factory, status=ErrandStatus.ACCEPTED, courier_id=uuid4())
    response = get(client, is_admin=True, type="Administrator")
    assert response.json() == {"total": 0, "items": []}


@pytest.mark.parametrize("admin", [False, True])
def test_available_only_applies_even_to_participants_and_admins(endpoint, admin):
    client, claims, factory = endpoint
    if admin:
        claims["type"] = "Administrator"
    visible = seed(factory)
    seed(factory, requester_id=UUID(claims["sub"]), expires_at=datetime.now(timezone.utc) - timedelta(hours=1))
    seed(factory, status=ErrandStatus.ACCEPTED, courier_id=UUID(claims["sub"]))
    assert ids(get(client, available_only=True)) == [str(visible["id"])]
    assert get(client, available_only=True, status="ACCEPTED").json() == {"total": 0, "items": []}


def test_filters_intersect_and_ranges_are_inclusive(endpoint):
    client, _, factory = endpoint
    expiry = datetime.now(timezone.utc) + timedelta(hours=2)
    target = seed(factory, credit_value=10, expires_at=expiry)
    common = {key: target[key] for key in ("supplier_id", "requester_id", "delivery_building_id")}
    seed(factory, **common, credit_value=11, expires_at=expiry)
    seed(factory, **common, credit_value=10, expires_at=expiry + timedelta(seconds=1))
    seed(factory, credit_value=10, expires_at=expiry)
    response = get(client, **{key: str(value) for key, value in common.items()},
                   min_credit_value=10, max_credit_value=10,
                   expires_after=expiry.isoformat(), expires_before=expiry.isoformat())
    assert ids(response) == [str(target["id"])]
    assert response.json()["total"] == 1


def test_requester_and_courier_filters_narrow_visible_records(endpoint):
    client, claims, factory = endpoint
    owner = UUID(claims["sub"])
    own = seed(factory, requester_id=owner)
    assigned = seed(factory, status=ErrandStatus.ACCEPTED, courier_id=owner)
    seed(factory)
    assert ids(get(client, requester_id=str(owner))) == [str(own["id"])]
    assert ids(get(client, courier_id=str(owner))) == [str(assigned["id"])]


def test_admin_supplier_active_check_includes_all_requesters_and_stored_overdue_states(endpoint):
    client, claims, factory = endpoint
    supplier = uuid4()
    seed(factory, supplier_id=supplier)
    seed(factory, supplier_id=supplier, status=ErrandStatus.ACCEPTED, courier_id=uuid4(),
         expires_at=datetime.now(timezone.utc) - timedelta(hours=1))
    seed(factory, supplier_id=supplier, status=ErrandStatus.COMPLETED, courier_id=uuid4())
    seed(factory, status=ErrandStatus.ACCEPTED, courier_id=uuid4())
    params = {"supplier_id": str(supplier), "status": ["OPEN", "ACCEPTED"], "size": 1, "page": 100}
    assert get(client, **params).json() == {"total": 1, "items": []}
    claims["type"] = "Administrator"
    assert get(client, **params).json() == {"total": 2, "items": []}


def test_multiple_statuses_use_or_within_visibility(endpoint):
    client, claims, factory = endpoint
    own = UUID(claims["sub"])
    accepted = seed(factory, requester_id=own, status=ErrandStatus.ACCEPTED, courier_id=uuid4())
    completed = seed(factory, requester_id=own, status=ErrandStatus.COMPLETED, courier_id=uuid4())
    seed(factory, requester_id=own, status=ErrandStatus.CANCELLED)
    seed(factory, status=ErrandStatus.ACCEPTED, courier_id=uuid4())
    response = get(client, status=["ACCEPTED", "COMPLETED"])
    assert set(ids(response)) == {str(accepted["id"]), str(completed["id"])}


@pytest.mark.parametrize("field", ["created_at", "credit_value", "expires_at"])
@pytest.mark.parametrize("direction", ["asc", "desc"])
def test_sort_options(endpoint, field, direction):
    client, _, factory = endpoint
    now = datetime.now(timezone.utc)
    records = []
    for value in [2, 1, 3]:
        sort_value = value if field == "credit_value" else now + timedelta(minutes=value)
        records.append(seed(factory, **{field: sort_value}))
    expected = sorted(records, key=lambda record: record[field], reverse=direction == "desc")
    assert ids(get(client, sort=f"{field},{direction}")) == [str(record["id"]) for record in expected]


def test_stable_pagination_and_total(endpoint):
    client, _, factory = endpoint
    now = datetime.now(timezone.utc)
    prefix = 0xA << 124  # Avoid SQLite treating all-digit UUIDs as numbers.
    for number in [3, 1, 2]:
        seed(factory, id=UUID(int=prefix + number), created_at=now)
    response = get(client, page=1, size=1)
    assert ids(response) == [str(UUID(int=prefix + 2))]
    assert response.json()["total"] == 3
    assert get(client, page=10, size=1).json() == {"total": 3, "items": []}


def test_unknown_errand_id_returns_empty(endpoint):
    client, _, _ = endpoint
    assert get(client, errand_id=str(uuid4())).json() == {"total": 0, "items": []}


def test_completion_confirmation_is_available_through_listing_not_old_route(endpoint):
    client, claims, factory = endpoint
    completed_at = datetime.now(timezone.utc) - timedelta(hours=2)
    target = seed(
        factory, status=ErrandStatus.COMPLETED, courier_id=UUID(claims["sub"]),
        completed_at=completed_at,
        expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    response = get(client, errand_id=str(target["id"]))
    assert ids(response) == [str(target["id"])]
    item = response.json()["items"][0]
    assert item["status"] == "COMPLETED"
    # SQLite drops timezone information, unlike PostgreSQL timestamptz.
    assert datetime.fromisoformat(item["completed_at"]).replace(tzinfo=timezone.utc) == completed_at
    assert client.get(f"/errand/{target['id']}/completion-confirmation").status_code == 404


@pytest.mark.parametrize("params", [
    {"errand_id": "invalid"}, {"supplier_id": "invalid"}, {"requester_id": "invalid"},
    {"courier_id": "invalid"}, {"delivery_building_id": "invalid"}, {"status": "UNKNOWN"},
    {"status": ""}, {"sort": "credit_value"}, {"sort": "id,asc"},
    {"page": -1}, {"size": 0}, {"size": 101}, {"min_credit_value": 0},
    {"min_credit_value": 10, "max_credit_value": 5},
    {"expires_after": "2026-10-08T12:00:00"},
    {"expires_after": "2026-10-09T12:00:00Z", "expires_before": "2026-10-08T12:00:00Z"},
    {"available_only": "invalid"},
])
def test_invalid_parameters(endpoint, params):
    client, _, _ = endpoint
    assert get(client, **params).status_code == 422


@pytest.mark.parametrize("subject", [None, "invalid", 123, "missing"])
def test_invalid_subject(endpoint, subject):
    client, claims, _ = endpoint
    if subject == "missing":
        claims.pop("sub")
    else:
        claims["sub"] = subject
    assert get(client).status_code == 401


def test_authentication_required(endpoint):
    client, _, _ = endpoint
    app.dependency_overrides.pop(verified_claims)
    assert client.get("/errands").status_code in (401, 403)


def test_rejected_token(endpoint):
    client, _, _ = endpoint

    def reject():
        raise HTTPException(status_code=401, detail="Invalid or expired access token")

    app.dependency_overrides[verified_claims] = reject
    assert get(client).status_code == 401


def test_get_does_not_process_expiry_or_change_data(endpoint):
    client, claims, factory = endpoint
    owner = UUID(claims["sub"])
    overdue_open = seed(factory, requester_id=owner, expires_at=datetime.now(timezone.utc) - timedelta(hours=1))
    overdue_accepted = seed(factory, status=ErrandStatus.ACCEPTED, courier_id=owner,
                            expires_at=datetime.now(timezone.utc) - timedelta(hours=1))
    assert len(ids(get(client))) == 2
    assert get(client, available_only=True).json() == {"total": 0, "items": []}
    with factory() as db:
        for record in [overdue_open, overdue_accepted]:
            stored = db.get(Errand, record["id"])
            assert stored.status == record["status"]
            assert stored.credit_value == record["credit_value"]
            assert stored.failed_at is None
            assert stored.failure_reason is None


