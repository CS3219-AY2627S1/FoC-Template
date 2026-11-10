# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-29, 2026-11-10
# Scope: Added participant dispute report API tests; covered selected problems, private
# statements and withdrawal.
# Author review: I validated correctness and supplied additional boundary checks.

"""N2F3.2: participants report problems, send private details and may withdraw while OPEN."""

from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.admin.disputes import (
    DisputeAlreadyOpen,
    ErrandChanged,
    ReportNotAllowed,
    dispute_id_for,
)
from app.core.config import Settings
from app.main import create_app
from tests.admin_fakes import (
    FakeDisputes,
    FakeIdentity,
    FakeOrders,
    NoDatabase,
    dispute_row,
    statement_row,
)

AUTH = {"Authorization": "Bearer user-token"}
KEY = str(uuid4())


def client_for(disputes=None, orders=None, identity=None):
    app = create_app(
        Settings(_env_file=None),
        NoDatabase(),
        identity=identity or FakeIdentity("USER"),
        disputes=disputes or FakeDisputes(),
        orders=orders or FakeOrders(),
    )
    return AsyncClient(transport=ASGITransport(app), base_url="http://test")


def problem(**overrides):
    return {"orderId": str(uuid4()), "problem": "ITEM_DAMAGED", **overrides}


async def report(client, payload=None, **headers):
    return await client.post(
        "/v1/disputes",
        json=payload or problem(),
        headers={**AUTH, "Idempotency-Key": KEY, **headers},
    )


async def withdraw(client, dispute_id, reason="We sorted it out in chat.", version=1):
    return await client.post(
        f"/v1/disputes/{dispute_id}/withdraw",
        json={"reason": reason, "expectedVersion": version},
        headers=AUTH,
    )


async def send(client, dispute_id, text="The courier never replied.", key=None):
    return await client.post(
        f"/v1/disputes/{dispute_id}/statements",
        json={"body": text},
        headers={**AUTH, "Idempotency-Key": key or str(uuid4())},
    )


async def test_reporting_holds_the_errand_and_records_the_selected_problem():
    disputes, orders, identity = FakeDisputes(), FakeOrders(), FakeIdentity("USER")
    payload = problem(problem="OTHER", problemDetails="  Courier never replied  ")
    async with client_for(disputes, orders, identity) as client:
        response = await report(client, payload)
    assert response.status_code == 201
    view = response.json()
    assert (view["problem"], view["problemDetails"]) == ("OTHER", "Courier never replied")
    assert (view["status"], view["ownReport"], view["reporterRole"]) == (
        "OPEN",
        True,
        "REQUESTER",
    )
    assert view["statements"] == [] and view["version"] == 1
    dispute_id = dispute_id_for(identity.user_id, UUID(KEY))
    assert orders.changes() == [
        ("open", UUID(payload["orderId"]), dispute_id, "USER", "user-token")
    ]
    values = disputes.calls[-1][1]
    assert (values["role"], values["description"], values["evidence_refs"]) == (
        "REQUESTER",
        None,
        [],
    )


async def test_the_view_never_exposes_administrator_fields():
    async with client_for() as client:
        view = (await report(client)).json()
    assert {"description", "evidenceRefs", "history", "createdBy"}.isdisjoint(view)


@pytest.mark.parametrize(
    "payload",
    [
        problem(problem="OTHER"),
        problem(problem="OTHER", problemDetails="   "),
        problem(problemDetails="x" * 501),
        problem(problem="ADMIN_DECISION"),
        problem(description="Participants no longer send a description"),
        problem(evidenceRefs=["chat:1"]),
        {"problem": "ITEM_DAMAGED"},
    ],
)
async def test_invalid_reports_are_rejected_before_anything_changes(payload):
    disputes, orders = FakeDisputes(), FakeOrders()
    async with client_for(disputes, orders) as client:
        response = await report(client, payload)
    assert response.status_code == 422
    assert disputes.calls == [] and orders.calls == []


async def test_non_participants_learn_nothing_and_change_nothing():
    disputes, orders = FakeDisputes(), FakeOrders(participation=None)
    async with client_for(disputes, orders) as client:
        response = await report(client)
    assert (response.status_code, response.json()["error"]["code"]) == (422, "ORDER_NOT_FOUND")
    assert orders.changes() == [] and disputes.calls == []


@pytest.mark.parametrize(
    "error,code", [(DisputeAlreadyOpen(), "DISPUTE_ALREADY_OPEN"), (ReportNotAllowed(), None)]
)
async def test_order_decides_whether_the_errand_can_be_disputed(error, code):
    disputes = FakeDisputes()
    async with client_for(disputes, FakeOrders(error=error)) as client:
        response = await report(client)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == (code or "REPORT_NOT_ALLOWED")
    assert "create" not in [call[0] for call in disputes.calls]


async def test_both_participants_follow_every_dispute_but_only_their_own_statements():
    disputes, identity = FakeDisputes(), FakeIdentity("USER")
    other = uuid4()
    mine = dispute_row(created_by=identity.user_id, status="UNDER_REVIEW")
    theirs = dispute_row(
        created_by=other,
        reporter_role="COURIER",
        status="REJECTED",
        resolution_reason="The photo shows the item.",
    )
    raised = dispute_row(reporter_role=None, description="Admin notes", status="WITHDRAWN")
    disputes.page = ([mine, theirs, raised], 3)
    disputes.statements = [
        statement_row(mine["id"], identity.user_id, "Mine"),
        statement_row(mine["id"], other, "Theirs", role="COURIER"),
        statement_row(theirs["id"], identity.user_id, "My side of their report"),
    ]
    order_id = uuid4()
    async with client_for(disputes, FakeOrders(), identity) as client:
        listing = await client.get(f"/v1/disputes?orderId={order_id}", headers=AUTH)
    items = listing.json()["items"]
    assert [(item["ownReport"], item["reporterRole"]) for item in items] == [
        (True, "REQUESTER"),
        (False, "COURIER"),
        (False, None),
    ]
    assert [[s["body"] for s in item["statements"]] for item in items] == [
        ["Mine"],
        ["My side of their report"],
        [],
    ]
    assert items[1]["resolutionReason"] == "The photo shows the item."
    assert "description" not in items[2]
    assert ("reports_about", order_id, {"page": 1, "page_size": 20}) in disputes.calls


async def test_listing_another_errands_disputes_is_refused():
    disputes = FakeDisputes()
    async with client_for(disputes, FakeOrders(participation=None)) as client:
        response = await client.get(f"/v1/disputes?orderId={uuid4()}", headers=AUTH)
    assert response.json()["error"]["code"] == "ORDER_NOT_FOUND"
    assert disputes.calls == []


async def test_the_reporter_withdraws_an_open_dispute_with_a_reason():
    disputes, orders, identity = FakeDisputes(), FakeOrders(), FakeIdentity("USER")
    disputes.row = dispute_row(created_by=identity.user_id)
    row = disputes.row
    async with client_for(disputes, orders, identity) as client:
        response = await withdraw(client, row["id"], reason="  We sorted it out.  ")
    assert response.status_code == 200
    assert (response.json()["status"], response.json()["resolutionReason"]) == (
        "WITHDRAWN",
        "We sorted it out.",
    )
    assert orders.changes() == [("restore", row["order_id"], row["id"], "USER", "user-token")]
    assert disputes.calls[-1][2]["reporter"] == identity.user_id


async def test_withdrawal_is_closed_once_an_administrator_reviews():
    disputes, orders, identity = FakeDisputes(), FakeOrders(), FakeIdentity("USER")
    disputes.row = dispute_row(created_by=identity.user_id, status="UNDER_REVIEW")
    async with client_for(disputes, orders, identity) as client:
        response = await withdraw(client, disputes.row["id"])
    assert (response.status_code, response.json()["error"]["code"]) == (
        409,
        "WITHDRAWAL_NOT_ALLOWED",
    )
    assert orders.changes() == []


@pytest.mark.parametrize("reporter_role", ["COURIER", None])
async def test_only_the_reporter_can_withdraw(reporter_role):
    disputes, orders = FakeDisputes(), FakeOrders()
    disputes.row = dispute_row(reporter_role=reporter_role, description=None)
    async with client_for(disputes, orders) as client:
        response = await withdraw(client, disputes.row["id"])
    assert response.status_code == 404
    assert orders.changes() == []


@pytest.mark.parametrize(
    "payload",
    [
        {"expectedVersion": 1},
        {"reason": "   ", "expectedVersion": 1},
        {"reason": "x" * 1001, "expectedVersion": 1},
        {"reason": "Sorted"},
    ],
)
async def test_withdrawal_needs_a_reason_and_version(payload):
    disputes = FakeDisputes()
    async with client_for(disputes) as client:
        response = await client.post(
            f"/v1/disputes/{uuid4()}/withdraw", json=payload, headers=AUTH
        )
    assert response.status_code == 422
    assert disputes.calls == []


async def test_a_changed_errand_keeps_the_dispute_open():
    disputes, identity = FakeDisputes(), FakeIdentity("USER")
    disputes.row = dispute_row(created_by=identity.user_id)
    async with client_for(disputes, FakeOrders(error=ErrandChanged()), identity) as client:
        response = await withdraw(client, disputes.row["id"])
    assert response.json()["error"]["code"] == "ERRAND_CHANGED"
    assert disputes.row["status"] == "OPEN"


@pytest.mark.parametrize("role", ["REQUESTER", "COURIER"])
async def test_either_participant_sends_private_details_while_open(role):
    disputes, identity = FakeDisputes(), FakeIdentity("USER")
    disputes.row = dispute_row(status="UNDER_REVIEW")
    orders = FakeOrders(participation=(role, "DISPUTED"))
    async with client_for(disputes, orders, identity) as client:
        response = await send(client, disputes.row["id"], "  The courier never replied.  ")
    assert response.status_code == 201
    assert [s["body"] for s in response.json()["statements"]] == ["The courier never replied."]
    values = disputes.calls[-1][1]
    assert (values["author"], values["role"]) == (identity.user_id, role)


async def test_details_are_refused_for_closed_disputes_and_strangers():
    disputes = FakeDisputes()
    disputes.row = dispute_row(status="ACCEPTED", resolution_reason="Refunded")
    async with client_for(disputes) as client:
        closed = await send(client, disputes.row["id"])
    async with client_for(disputes, FakeOrders(participation=None)) as client:
        stranger = await send(client, disputes.row["id"])
        missing = await send(client, uuid4())
    assert closed.json()["error"]["code"] == "DISPUTE_CLOSED"
    assert (stranger.status_code, missing.status_code) == (404, 404)
    assert "add_statement" not in [call[0] for call in disputes.calls]


@pytest.mark.parametrize("text", ["", "   ", "x" * 2001])
async def test_details_are_validated(text):
    disputes = FakeDisputes()
    disputes.row = dispute_row()
    async with client_for(disputes) as client:
        response = await send(client, disputes.row["id"], text)
    assert response.status_code == 422


async def test_details_need_an_idempotency_key():
    disputes = FakeDisputes()
    disputes.row = dispute_row()
    async with client_for(disputes) as client:
        response = await client.post(
            f"/v1/disputes/{disputes.row['id']}/statements", json={"body": "Hi"}, headers=AUTH
        )
    assert response.json()["error"]["code"] == "IDEMPOTENCY_KEY_REQUIRED"


async def test_participants_see_legacy_disputes_and_cannot_withdraw_them():
    disputes, orders, identity = FakeDisputes(), FakeOrders(), FakeIdentity("USER")
    disputes.row = dispute_row(
        created_by=identity.user_id, legacy_record=True, problem=None, description="Old"
    )
    disputes.page = ([disputes.row], 1)
    async with client_for(disputes, orders, identity) as client:
        listing = await client.get(f"/v1/disputes?orderId={uuid4()}", headers=AUTH)
        refused = await withdraw(client, disputes.row["id"])
    item = listing.json()["items"][0]
    assert (item["legacy"], item["problem"], item["ownReport"]) == (True, None, True)
    assert "description" not in item
    assert refused.json()["error"]["code"] == "WITHDRAWAL_NOT_ALLOWED"
    assert orders.changes() == []
