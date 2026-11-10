# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28
# Scope: Added tests for read-only admin settlement and credit analytics.
# Author review: I validated correctness and supplied additional boundary checks.

"""N2F3.4.2 and N2F4.5: read-only administrator credit views for the Admin Dashboard."""

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from tests.credit_fakes import FakeIdentity, FakeLedger
from tests.test_user_api import AUTH, client_for

PERIOD = "from=2026-10-20&to=2026-10-21"


async def test_ordinary_users_cannot_read_admin_credit_views():
    ledger = FakeLedger()
    async with client_for(ledger, FakeIdentity("USER")) as client:
        settlement = await client.get(f"/v1/admin/credit/reservations/{uuid4()}", headers=AUTH)
        analytics = await client.get(f"/v1/admin/credit/analytics?{PERIOD}", headers=AUTH)
    assert settlement.status_code == analytics.status_code == 403
    assert ledger.calls == []


@pytest.mark.parametrize("role", ["ADMIN", "SUPER_ADMIN"])
async def test_settlement_outcome_exposes_only_credit_state(role):
    order_id = uuid4()
    ledger = FakeLedger()
    ledger.reservation = {
        "operation_id": uuid4(),
        "order_id": order_id,
        "requester_id": uuid4(),
        "amount": 5,
        "reservation_id": uuid4(),
        "state": "TRANSFERRED",
        "updated_at": datetime(2026, 10, 20, 4, 0, tzinfo=UTC),
    }
    async with client_for(ledger, FakeIdentity(role)) as client:
        response = await client.get(f"/v1/admin/credit/reservations/{order_id}", headers=AUTH)
    assert response.json() == {
        "orderId": str(order_id),
        "state": "TRANSFERRED",
        "amount": 5,
        "updatedAt": "2026-10-20T04:00:00Z",
    }
    assert ledger.calls == [("status", order_id)]


async def test_unknown_settlement_is_404():
    async with client_for(FakeLedger(), FakeIdentity("ADMIN")) as client:
        response = await client.get(f"/v1/admin/credit/reservations/{uuid4()}", headers=AUTH)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "RESERVATION_NOT_FOUND"


async def test_analytics_separates_current_balances_from_period_transfers():
    ledger = FakeLedger()
    ledger.totals = {"available": 700, "reserved": 40, "transfer_count": 3, "transfer_amount": 12}
    async with client_for(ledger, FakeIdentity("ADMIN")) as client:
        response = await client.get(f"/v1/admin/credit/analytics?{PERIOD}", headers=AUTH)
    body = response.json()
    assert (body["from"], body["to"], body["timeZone"]) == ("2026-10-20", "2026-10-21",
                                                            "Asia/Singapore")
    assert body["circulation"] == {"available": 700, "reserved": 40, "total": 740}
    assert body["transfers"] == {"count": 3, "amount": 12}
    assert "generatedAt" in body
    # Whole Singapore days: 00:00 SGT on 20 Oct up to 00:00 SGT on 22 Oct.
    assert ledger.calls == [(
        "credit_totals",
        datetime(2026, 10, 19, 16, 0, tzinfo=UTC),
        datetime(2026, 10, 21, 16, 0, tzinfo=UTC),
    )]


@pytest.mark.parametrize(
    "query",
    [
        "",
        "from=2026-10-20",
        "from=2026-10-21&to=2026-10-20",
        "from=2025-01-01&to=2026-01-02",
        f"{PERIOD}&extra=1",
    ],
)
async def test_analytics_period_validation(query):
    async with client_for(FakeLedger(), FakeIdentity("ADMIN")) as client:
        response = await client.get(f"/v1/admin/credit/analytics?{query}", headers=AUTH)
    assert response.status_code == 422
