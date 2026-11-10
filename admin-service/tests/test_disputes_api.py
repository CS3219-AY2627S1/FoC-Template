# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28, 2026-11-10
# Scope: Added dispute API tests for retries, conflicts and rejected attempts; covered disputed
# errands held, accepted and rejected through Order.
# Author review: I validated correctness and supplied additional boundary checks.

"""N2F3.2-N2F3.7 administrator dispute API; N2NFR3.3-N2NFR3.5 retries and conflicts."""

from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.exc import OperationalError

from app.admin.disputes import (
    DisputeAlreadyOpen,
    DisputeNotFound,
    ErrandChanged,
    IdempotencyKeyReused,
    InvalidTransition,
    OrderNotFound,
    ReasonRequired,
    VersionConflict,
    dispute_id_for,
)
from app.admin.errors import unavailable
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

AUTH = {"Authorization": "Bearer admin-token"}
KEY = str(uuid4())


def client_for(disputes=None, orders=None, identity=None):
    app = create_app(
        Settings(_env_file=None),
        NoDatabase(),
        identity=identity or FakeIdentity(),
        disputes=disputes or FakeDisputes(),
        orders=orders or FakeOrders(),
    )
    return AsyncClient(transport=ASGITransport(app), base_url="http://test")


def body(**overrides):
    return {
        "orderId": str(uuid4()),
        "problem": "OTHER",
        "problemDetails": "  Courier marked it delivered; nothing arrived.  ",
        "description": "  Requester called the help desk with photos.  ",
        "evidenceRefs": ["chat:42"],
        **overrides,
    }


async def create(client, payload=None, **headers):
    return await client.post(
        "/v1/admin/disputes",
        json=payload or body(),
        headers={**AUTH, "Idempotency-Key": KEY, **headers},
    )


async def transition(client, dispute_id, **payload):
    return await client.post(
        f"/v1/admin/disputes/{dispute_id}/transitions",
        json={"expectedVersion": 1, **payload},
        headers=AUTH,
    )


async def test_ordinary_users_cannot_use_dispute_routes():
    disputes, orders = FakeDisputes(), FakeOrders()
    dispute_id = uuid4()
    async with client_for(disputes, orders, FakeIdentity("USER")) as client:
        statuses = [
            (await create(client)).status_code,
            (await client.get("/v1/admin/disputes", headers=AUTH)).status_code,
            (await client.get(f"/v1/admin/disputes/{dispute_id}", headers=AUTH)).status_code,
            (await transition(client, dispute_id, toStatus="UNDER_REVIEW")).status_code,
            (await client.get("/v1/admin/audit-log", headers=AUTH)).status_code,
        ]
    assert statuses == [403] * 5
    assert disputes.calls == [] and orders.calls == []


async def test_recording_a_dispute_holds_the_errand_first_then_starts_open():
    disputes, orders, identity = FakeDisputes(), FakeOrders(), FakeIdentity()
    payload = body()
    async with client_for(disputes, orders, identity) as client:
        response = await create(client, payload, **{"X-Correlation-ID": "req-1"})
    assert response.status_code == 201
    created = response.json()
    assert (created["status"], created["version"], created["reporterRole"]) == ("OPEN", 1, None)
    assert (created["problem"], created["problemDetails"]) == (
        "OTHER",
        "Courier marked it delivered; nothing arrived.",
    )
    assert created["description"] == "Requester called the help desk with photos."
    assert created["evidenceRefs"] == ["chat:42"] and created["statements"] == []
    dispute_id = dispute_id_for(identity.user_id, UUID(KEY))
    assert created["disputeId"] == str(dispute_id)
    assert orders.changes() == [
        ("open", UUID(payload["orderId"]), dispute_id, "ADMIN", "admin-token")
    ]
    values = disputes.calls[-1][1]
    assert values["actor"] == identity.user_id and values["role"] is None
    assert values["correlation_id"] == "req-1"


async def test_replaying_the_same_request_returns_the_recorded_dispute_without_order():
    disputes, orders, payload = FakeDisputes(), FakeOrders(), body()
    async with client_for(disputes, orders) as client:
        first = await create(client, payload)
        disputes.existing = {**disputes.row, "request_hash": disputes.calls[-1][1]["fingerprint"]}
        replay = await create(client, payload)
        disputes.existing = {**disputes.existing, "request_hash": "another body"}
        reused = await create(client, payload)
    assert (first.status_code, replay.status_code) == (201, 200)
    assert len(orders.changes()) == 1
    assert reused.json()["error"]["code"] == "IDEMPOTENCY_KEY_REUSED"


async def test_a_retry_after_order_held_the_errand_records_the_same_dispute():
    disputes, orders, identity, payload = FakeDisputes(), FakeOrders(), FakeIdentity(), body()
    disputes.error = OperationalError("INSERT", {}, Exception("database down"))
    async with client_for(disputes, orders, identity) as client:
        failed = await create(client, payload)
        disputes.error = None
        retried = await create(client, payload)
    assert (failed.status_code, retried.status_code) == (503, 201)
    dispute_ids = {call[2] for call in orders.changes()}
    assert dispute_ids == {dispute_id_for(identity.user_id, UUID(KEY))}


@pytest.mark.parametrize("key", [None, "", "not-a-uuid"])
async def test_recording_needs_an_idempotency_key(key):
    disputes, orders = FakeDisputes(), FakeOrders()
    headers = dict(AUTH) if key is None else {**AUTH, "Idempotency-Key": key}
    async with client_for(disputes, orders) as client:
        response = await client.post("/v1/admin/disputes", json=body(), headers=headers)
    assert response.json()["error"]["code"] == "IDEMPOTENCY_KEY_REQUIRED"
    assert disputes.calls == [] and orders.calls == []


@pytest.mark.parametrize(
    "payload",
    [
        body(description="   "),
        body(problem="ADMIN_DECISION"),
        body(problemDetails=None),
        body(problemDetails="   "),
        body(problemDetails="x" * 501),
        body(evidenceRefs=[f"ref-{index}" for index in range(11)]),
        body(evidenceRefs=["   "]),
        body(status="ACCEPTED"),
        {"description": "No errand reference", "problem": "ITEM_DAMAGED"},
    ],
)
async def test_invalid_dispute_bodies_are_rejected(payload):
    disputes, orders = FakeDisputes(), FakeOrders()
    async with client_for(disputes, orders) as client:
        response = await create(client, payload)
    assert response.status_code == 422
    assert disputes.calls == [] and orders.changes() == []


@pytest.mark.parametrize(
    "error,status,code",
    [
        (OrderNotFound(), 422, "ORDER_NOT_FOUND"),
        (DisputeAlreadyOpen(), 409, "DISPUTE_ALREADY_OPEN"),
        (unavailable("ORDER_UNAVAILABLE"), 503, "ORDER_UNAVAILABLE"),
    ],
)
async def test_order_refusals_store_nothing_but_the_rejection(error, status, code):
    disputes = FakeDisputes()
    payload = body()
    async with client_for(disputes, FakeOrders(error=error)) as client:
        response = await create(client, payload)
    assert (response.status_code, response.json()["error"]["code"]) == (status, code)
    assert [call[0] for call in disputes.calls] == ["by_key"]
    rejection = disputes.rejections[0]
    assert (rejection["action"], rejection["target_type"], rejection["error_code"]) == (
        "DISPUTE_CREATE",
        "ORDER",
        code,
    )
    assert rejection["target_id"] == UUID(payload["orderId"])


async def test_review_leaves_the_errand_alone():
    disputes, orders = FakeDisputes(), FakeOrders()
    disputes.row = dispute_row()
    async with client_for(disputes, orders) as client:
        response = await transition(client, disputes.row["id"], toStatus="UNDER_REVIEW", reason=" ")
    assert response.status_code == 200
    assert (response.json()["status"], response.json()["version"]) == ("UNDER_REVIEW", 2)
    assert disputes.calls[0][2]["reason"] is None  # a blank reason is no reason
    assert orders.changes() == []


async def test_accepting_fails_the_errand_with_the_reporters_problem():
    disputes, orders = FakeDisputes(), FakeOrders()
    disputes.row = dispute_row(
        status="UNDER_REVIEW", problem="OTHER", problem_details="Courier never replied"
    )
    row = disputes.row
    async with client_for(disputes, orders) as client:
        response = await transition(
            client, row["id"], toStatus="ACCEPTED", reason="  The courier admitted it.  "
        )
    assert response.status_code == 200
    accepted = response.json()
    assert (accepted["status"], accepted["resolutionReason"]) == (
        "ACCEPTED",
        "The courier admitted it.",
    )
    assert orders.changes() == [
        ("accept", row["order_id"], row["id"], "OTHER", "Courier never replied", "admin-token")
    ]


async def test_rejecting_returns_the_errand_to_its_earlier_state():
    disputes, orders = FakeDisputes(), FakeOrders()
    disputes.row = dispute_row(status="UNDER_REVIEW")
    row = disputes.row
    async with client_for(disputes, orders) as client:
        response = await transition(
            client, row["id"], toStatus="REJECTED", reason="Delivery photo shows the item."
        )
    assert response.json()["status"] == "REJECTED"
    assert orders.changes() == [("restore", row["order_id"], row["id"], "ADMIN", "admin-token")]


@pytest.mark.parametrize("target", ["ACCEPTED", "REJECTED"])
async def test_a_changed_errand_keeps_the_dispute_under_review(target):
    disputes = FakeDisputes()
    disputes.row = dispute_row(status="UNDER_REVIEW")
    async with client_for(disputes, FakeOrders(error=ErrandChanged())) as client:
        response = await transition(client, disputes.row["id"], toStatus=target, reason="Checked")
    assert (response.status_code, response.json()["error"]["code"]) == (409, "ERRAND_CHANGED")
    assert disputes.row["status"] == "UNDER_REVIEW"
    assert disputes.rejections[0]["error_code"] == "ERRAND_CHANGED"


async def test_an_unfinished_decision_says_to_repeat_it():
    disputes, orders = FakeDisputes(), FakeOrders()
    disputes.row = dispute_row(status="UNDER_REVIEW")
    disputes.fail_after_apply = True
    async with client_for(disputes, orders) as client:
        response = await transition(client, disputes.row["id"], toStatus="ACCEPTED", reason="Ok")
    assert (response.status_code, response.json()["error"]["code"]) == (
        409,
        "DECISION_INCOMPLETE",
    )


@pytest.mark.parametrize(
    "error,status,code",
    [
        (InvalidTransition(), 409, "INVALID_TRANSITION"),
        (VersionConflict(), 409, "VERSION_CONFLICT"),
        (ReasonRequired(), 422, "REASON_REQUIRED"),
        (DisputeNotFound(), 404, "DISPUTE_NOT_FOUND"),
    ],
)
async def test_rejected_status_changes_are_reported_and_audited(error, status, code):
    disputes = FakeDisputes()
    disputes.row = dispute_row()
    disputes.error = error
    dispute_id = disputes.row["id"]
    async with client_for(disputes) as client:
        response = await transition(client, dispute_id, toStatus="ACCEPTED", reason="Refund")
    assert (response.status_code, response.json()["error"]["code"]) == (status, code)
    rejection = disputes.rejections[0]
    assert (rejection["action"], rejection["target_type"], rejection["target_id"]) == (
        "DISPUTE_TRANSITION",
        "DISPUTE",
        dispute_id,
    )
    assert rejection["error_code"] == code


async def test_audit_failure_does_not_hide_the_original_rejection():
    disputes = FakeDisputes()
    disputes.row = dispute_row()
    disputes.error = VersionConflict()
    disputes.audit_error = OperationalError("INSERT", {}, Exception("database down"))
    async with client_for(disputes) as client:
        response = await transition(client, disputes.row["id"], toStatus="UNDER_REVIEW")
    assert response.json()["error"]["code"] == "VERSION_CONFLICT"


@pytest.mark.parametrize(
    "payload",
    [
        {"toStatus": "OPEN", "expectedVersion": 1},
        # Withdrawal belongs to the reporter, never to administrators.
        {"toStatus": "WITHDRAWN", "reason": "Sorted out", "expectedVersion": 1},
        {"toStatus": "RESOLVED", "reason": "Old status name", "expectedVersion": 1},
        {"toStatus": "ACCEPTED", "reason": "Refund agreed"},
        {"toStatus": "ACCEPTED", "reason": "Refund agreed", "expectedVersion": 0},
        {"toStatus": "ACCEPTED", "reason": "x" * 1001, "expectedVersion": 1},
        {"toStatus": "ACCEPTED", "errandOutcome": "FAILED", "expectedVersion": 1},
    ],
)
async def test_invalid_status_change_bodies_are_rejected(payload):
    disputes = FakeDisputes()
    async with client_for(disputes) as client:
        response = await client.post(
            f"/v1/admin/disputes/{uuid4()}/transitions", json=payload, headers=AUTH
        )
    assert response.status_code == 422
    assert disputes.calls == []


async def test_administrators_see_every_statement_with_its_author():
    disputes = FakeDisputes()
    row = dispute_row(status="UNDER_REVIEW")
    requester, courier = row["created_by"], uuid4()
    disputes.row = row
    disputes.statements = [
        statement_row(row["id"], requester, "Nothing arrived."),
        statement_row(row["id"], courier, "I left it at the door.", role="COURIER"),
    ]
    async with client_for(disputes) as client:
        detail = (await client.get(f"/v1/admin/disputes/{row['id']}", headers=AUTH)).json()
    assert [(s["authorRole"], s["body"]) for s in detail["statements"]] == [
        ("REQUESTER", "Nothing arrived."),
        ("COURIER", "I left it at the door."),
    ]
    assert detail["statements"][1]["authorId"] == str(courier)


async def test_dispute_detail_listing_and_audit_log():
    disputes = FakeDisputes()
    row = dispute_row(reporter_role=None, description="Notes", evidence_refs=["chat:42"])
    disputes.row = row
    disputes.page = ([row], 1)
    disputes.audit = (
        [
            {
                "id": uuid4(),
                "actor_id": row["created_by"],
                "action": "DISPUTE_STATEMENT",
                "target_type": "DISPUTE",
                "target_id": row["id"],
                "outcome": "SUCCESS",
                "error_code": None,
                "correlation_id": "req-1",
                "occurred_at": row["created_at"],
            }
        ],
        1,
    )
    async with client_for(disputes) as client:
        detail = await client.get(f"/v1/admin/disputes/{row['id']}", headers=AUTH)
        missing = await client.get(f"/v1/admin/disputes/{uuid4()}", headers=AUTH)
        listing = await client.get(
            f"/v1/admin/disputes?status=WITHDRAWN&orderId={row['order_id']}&pageSize=10",
            headers=AUTH,
        )
        audit = await client.get("/v1/admin/audit-log?outcome=SUCCESS", headers=AUTH)
    assert detail.json()["evidenceRefs"] == ["chat:42"]
    assert missing.status_code == 404
    assert listing.json()["total"] == 1
    assert listing.json()["items"][0]["problem"] == "ITEM_DAMAGED"
    assert (
        "disputes_page",
        {"status": "WITHDRAWN", "order_id": row["order_id"], "page": 1, "page_size": 10},
    ) in disputes.calls
    assert audit.json()["items"][0]["action"] == "DISPUTE_STATEMENT"


@pytest.mark.parametrize(
    "url",
    [
        "/v1/admin/disputes?status=CLOSED",
        "/v1/admin/disputes?pageSize=51",
        "/v1/admin/disputes?sort=asc",
        "/v1/admin/audit-log?outcome=MAYBE",
    ],
)
async def test_invalid_list_filters_are_rejected(url):
    async with client_for() as client:
        assert (await client.get(url, headers=AUTH)).status_code == 422


def test_reused_key_error_names_any_request():
    assert IdempotencyKeyReused().code == "IDEMPOTENCY_KEY_REUSED"


async def test_deciding_a_legacy_dispute_records_the_decision_without_touching_the_errand():
    disputes, orders = FakeDisputes(), FakeOrders()
    disputes.row = dispute_row(
        status="UNDER_REVIEW", legacy_record=True, problem=None, description="Arrived cold"
    )
    async with client_for(disputes, orders) as client:
        response = await transition(
            client, disputes.row["id"], toStatus="ACCEPTED", reason="Refund"
        )
        detail = (await client.get(f"/v1/admin/disputes/{disputes.row['id']}", headers=AUTH)).json()
    assert response.status_code == 200 and response.json()["status"] == "ACCEPTED"
    assert orders.changes() == []
    assert (detail["legacy"], detail["problem"], detail["description"]) == (
        True,
        None,
        "Arrived cold",
    )


async def test_legacy_resolved_disputes_are_listed_and_filterable():
    disputes = FakeDisputes()
    row = dispute_row(
        status="RESOLVED", resolution_reason="Refund agreed", legacy_record=True, problem=None
    )
    disputes.page = ([row], 1)
    async with client_for(disputes) as client:
        listing = await client.get("/v1/admin/disputes?status=RESOLVED", headers=AUTH)
    assert listing.status_code == 200
    item = listing.json()["items"][0]
    assert (item["status"], item["legacy"]) == ("RESOLVED", True)
