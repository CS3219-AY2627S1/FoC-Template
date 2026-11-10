# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28
# Scope: Added tests for administrator errand oversight and analytics endpoints.
# Author review: I validated correctness and supplied additional boundary checks.

"""N2F2 and N2F4: read-only administrator errand oversight and analytics."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.main import create_app
from tests.order_fakes import FakeClients, MemoryRepository

BASE = datetime(2026, 10, 20, 4, 0, tzinfo=UTC)  # 12:00 on 20 Oct in Singapore
SUPPLIER = uuid4()
SNAPSHOT = {
    "name": "Campus Cafe",
    "buildingArea": "COM1",
    "pickupLocationDescription": "Counter",
    "floor": None,
    "latitude": None,
    "longitude": None,
    "updatedAt": "2026-10-01T00:00:00Z",
}


def errand(repo, *, created_at, state="OPEN", requester=None, courier=None, supplier=SUPPLIER,
           supplier_name="Campus Cafe", completed_at=None, overdue_at=None):
    order_id = uuid4()
    requester = requester or uuid4()
    repo.rows[order_id] = dict(
        id=order_id,
        requester_id=requester,
        courier_id=courier,
        supplier_id=supplier,
        supplier_snapshot={**SNAPSHOT, "name": supplier_name},
        item_description="Iced latte",
        delivery_location="COM1 lobby",
        reward=3,
        state=state,
        reservation_id=uuid4(),
        acceptance_deadline=created_at + timedelta(hours=1),
        delivery_deadline=created_at + timedelta(hours=2),
        created_at=created_at,
        updated_at=created_at,
        completed_at=completed_at,
        overdue_at=overdue_at,
    )
    repo.histories[order_id] = [
        dict(sequence=1, previous_state=None, new_state="OPEN", actor_id=requester,
             actor_type="USER", occurred_at=created_at)
    ]
    return order_id


@pytest.fixture
async def admin():
    clients = FakeClients(uuid4())
    clients.role = "ADMIN"
    repository = MemoryRepository()
    app = create_app(Settings(_env_file=None), clients=clients, repository=repository)
    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app),
            base_url="http://test",
            headers={"Authorization": "Bearer test-only"},
        ) as http:
            yield http, clients, repository


def admin_urls(order_id):
    period = "from=2026-10-20&to=2026-10-20"
    return [
        "/v1/admin/orders",
        f"/v1/admin/orders/{order_id}",
        f"/v1/admin/orders/{order_id}/history",
        f"/v1/admin/orders/analytics?{period}",
        f"/v1/admin/orders/analytics/users/{uuid4()}?{period}",
    ]


async def test_every_admin_read_requires_a_current_administrator(admin):
    http, clients, repo = admin
    order_id = errand(repo, created_at=BASE)
    for role, expected in (("USER", 403), ("ADMIN", 200), ("SUPER_ADMIN", 200)):
        clients.role = role
        for url in admin_urls(order_id):
            assert (await http.get(url)).status_code == expected, (role, url)


async def test_lists_every_errand_newest_first_with_combined_filters(admin):
    http, _, repo = admin
    person, other_supplier = uuid4(), uuid4()
    oldest = errand(repo, created_at=BASE, state="COMPLETED", requester=person,
                    completed_at=BASE + timedelta(minutes=30))
    middle = errand(repo, created_at=BASE + timedelta(hours=1), state="ACCEPTED", courier=person)
    newest = errand(repo, created_at=BASE + timedelta(hours=2), state="FAILED",
                    supplier=other_supplier, overdue_at=BASE + timedelta(hours=3))

    everything = (await http.get("/v1/admin/orders")).json()
    assert [item["orderId"] for item in everything["items"]] == [
        str(newest), str(middle), str(oldest)
    ]
    assert everything["total"] == 3 and "requesterId" in everything["items"][0]

    async def ids(query):
        response = await http.get(f"/v1/admin/orders?{query}")
        assert response.status_code == 200, response.text
        return {item["orderId"] for item in response.json()["items"]}

    assert await ids(f"participantId={person}") == {str(oldest), str(middle)}
    assert await ids("state=ACCEPTED&state=FAILED") == {str(middle), str(newest)}
    assert await ids(f"participantId={person}&state=COMPLETED") == {str(oldest)}
    assert await ids(f"supplierId={other_supplier}") == {str(newest)}
    assert await ids(f"orderId={middle}") == {str(middle)}
    assert await ids("overdue=true") == {str(newest)}
    assert await ids("overdue=false") == {str(oldest), str(middle)}
    assert await ids(f"requesterId={person}") == {str(oldest)}


async def test_creation_dates_follow_singapore_calendar_days(admin):
    http, _, repo = admin
    after_midnight = errand(repo, created_at=datetime(2026, 10, 27, 16, 30, tzinfo=UTC))
    before_midnight = errand(repo, created_at=datetime(2026, 10, 27, 15, 30, tzinfo=UTC))
    same_day = await http.get("/v1/admin/orders?createdFrom=2026-10-28&createdTo=2026-10-28")
    assert [item["orderId"] for item in same_day.json()["items"]] == [str(after_midnight)]
    earlier = await http.get("/v1/admin/orders?createdTo=2026-10-27")
    assert [item["orderId"] for item in earlier.json()["items"]] == [str(before_midnight)]


@pytest.mark.parametrize(
    "query",
    [
        "state=LOST",
        "createdFrom=2026-10-28&createdTo=2026-10-27",
        "createdFrom=28-10-2026",
        "overdue=maybe",
        "participantId=not-a-uuid",
        "sort=asc",
        "pageSize=51",
    ],
)
async def test_invalid_filters_are_rejected(admin, query):
    assert (await admin[0].get(f"/v1/admin/orders?{query}")).status_code == 422


async def test_detail_and_history_are_admin_only_reads(admin):
    http, _, repo = admin
    # The administrator is not a participant and the errand is no longer available.
    order_id = errand(repo, created_at=BASE, state="FAILED")
    detail = await http.get(f"/v1/admin/orders/{order_id}")
    assert detail.status_code == 200 and detail.json()["state"] == "FAILED"
    history = await http.get(f"/v1/admin/orders/{order_id}/history")
    assert history.json()["items"][0]["newState"] == "OPEN"
    # Participant routes keep their privacy rules even for administrators.
    assert (await http.get(f"/v1/orders/{order_id}")).status_code == 404
    assert (await http.get(f"/v1/orders/{order_id}/history")).status_code == 404
    assert (await http.get(f"/v1/admin/orders/{uuid4()}")).status_code == 404
    assert (await http.get(f"/v1/admin/orders/{uuid4()}/history")).status_code == 404


async def test_analytics_reports_period_counts_and_user_roles(admin):
    http, _, repo = admin
    requester = uuid4()
    errand(repo, created_at=BASE, state="COMPLETED", requester=requester, courier=uuid4(),
           completed_at=BASE + timedelta(minutes=40))
    errand(repo, created_at=BASE + timedelta(days=1), state="CANCELLED", requester=requester)
    errand(repo, created_at=BASE + timedelta(days=5))  # outside the period
    response = await http.get("/v1/admin/orders/analytics?from=2026-10-20&to=2026-10-21")
    body = response.json()
    assert (body["from"], body["to"], body["timeZone"]) == ("2026-10-20", "2026-10-21",
                                                            "Asia/Singapore")
    assert "generatedAt" in body and body["totalCreated"] == 2
    assert body["rates"] == {"completed": 0.5, "cancelled": 0.5, "expired": 0.0, "failed": 0.0}
    assert body["daily"] == [
        {"day": "2026-10-20", "created": 1},
        {"day": "2026-10-21", "created": 1},
    ]
    assert body["participants"] == {"requesters": 1, "couriers": 1, "distinctParticipants": 2}
    assert body["meanCompletionMinutes"] == 40.0
    assert body["suppliers"][0]["supplierName"] == "Campus Cafe"

    user = await http.get(
        f"/v1/admin/orders/analytics/users/{requester}?from=2026-10-20&to=2026-10-21"
    )
    activity = user.json()
    assert activity["userId"] == str(requester)
    assert activity["asRequester"]["total"] == 2
    assert activity["asRequester"]["byState"]["CANCELLED"] == 1
    assert activity["asCourier"] == {"total": 0, "byState": {
        state: 0 for state in activity["asCourier"]["byState"]
    }}


@pytest.mark.parametrize(
    "query",
    [
        "",
        "from=2026-10-20",
        "from=2026-10-21&to=2026-10-20",
        "from=2025-01-01&to=2026-01-02",
        "from=2026-10-20&to=2026-10-21&extra=1",
    ],
)
async def test_analytics_period_validation(admin, query):
    assert (await admin[0].get(f"/v1/admin/orders/analytics?{query}")).status_code == 422
