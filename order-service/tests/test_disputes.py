# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
# Scope: Added tests for the DISPUTED errand state, its service credential and visibility.
# Author review: I validated correctness and supplied additional boundary checks.

"""N2F3: a reported problem holds an errand in DISPUTED until it is withdrawn or decided."""

from datetime import timedelta
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

from app.core.config import Settings
from app.main import create_app
from app.orders.errors import ApiError
from app.orders.lifecycle import (
    accept_dispute_values,
    open_dispute_values,
    restore_values,
    transition_values,
)
from app.orders.outbox import event_payload
from app.orders.schemas import AcceptDispute
from tests.order_fakes import FakeClients, MemoryRepository
from tests.test_admin_orders import BASE, errand
from tests.test_fulfilment import COURIER, NOW, OWNER, row

ADMIN, DISPUTE = uuid4(), uuid4()
SECRET = "admin-order-test-secret"
FAILURE = {"reason": "ITEM_DAMAGED", "details": None}


def disputed(source="PICKED_UP", dispute=DISPUTE, **changes):
    values = open_dispute_values(row(state=source), OWNER, "USER", dispute, NOW)
    return {**row(state=source), **values, **changes}


@pytest.mark.parametrize("source", ["ACCEPTED", "PICKED_UP", "DELIVERED"])
@pytest.mark.parametrize("actor,actor_type", [(OWNER, "USER"), (COURIER, "USER"), (ADMIN, "ADMIN")])
def test_participants_or_administrators_dispute_an_accepted_errand(source, actor, actor_type):
    values = open_dispute_values(row(state=source), actor, actor_type, DISPUTE, NOW)
    assert values["state"] == "DISPUTED"
    assert (values["dispute_id"], values["disputed_from_state"]) == (DISPUTE, source)
    assert values["disputed_at"] == NOW


@pytest.mark.parametrize("state", ["OPEN", "COMPLETED", "FAILED", "CANCELLED", "EXPIRED"])
def test_only_accepted_errands_can_be_disputed(state):
    with pytest.raises(ApiError, match="INVALID_TRANSITION"):
        open_dispute_values(row(state=state), OWNER, "USER", DISPUTE, NOW)


def test_one_dispute_at_a_time_and_replays_change_nothing():
    order = disputed()
    assert open_dispute_values(order, COURIER, "USER", DISPUTE, NOW) == {}
    with pytest.raises(ApiError, match="DISPUTE_OPEN"):
        open_dispute_values(order, COURIER, "USER", uuid4(), NOW)


def test_strangers_learn_nothing_about_the_errand():
    for check in (
        lambda: open_dispute_values(row(), uuid4(), "USER", DISPUTE, NOW),
        lambda: restore_values(disputed(), uuid4(), "USER", DISPUTE, restored=False),
    ):
        with pytest.raises(ApiError) as error:
            check()
        assert error.value.status == 404


@pytest.mark.parametrize("offset,flagged", [(-1, True), (0, True), (1, False)])
def test_overdue_marker_is_kept_as_history_when_disputed(offset, flagged):
    deadline = NOW + timedelta(seconds=offset)
    values = open_dispute_values(row(delivery_deadline=deadline), OWNER, "USER", DISPUTE, NOW)
    assert values.get("overdue_at") == (deadline if flagged else None)


@pytest.mark.parametrize("action", ["pickup", "deliver", "complete"])
def test_nothing_moves_the_errand_on_while_disputed(action):
    source = {"pickup": "ACCEPTED", "deliver": "PICKED_UP", "complete": "DELIVERED"}[action]
    order = disputed(source, picked_up_at=None, delivered_at=None, completed_at=None)
    actor = OWNER if action == "complete" else COURIER
    with pytest.raises(ApiError, match="ERRAND_DISPUTED"):
        transition_values(order, actor, action, NOW)


def test_an_action_already_done_before_the_dispute_still_replays():
    order = disputed("DELIVERED", picked_up_at=NOW, delivered_at=NOW)
    assert transition_values(order, COURIER, "deliver", NOW) == {}


@pytest.mark.parametrize("source", ["ACCEPTED", "PICKED_UP", "DELIVERED"])
@pytest.mark.parametrize("actor,actor_type", [(OWNER, "USER"), (ADMIN, "ADMIN")])
def test_withdrawal_or_rejection_returns_the_errand(source, actor, actor_type):
    values = restore_values(disputed(source), actor, actor_type, DISPUTE, restored=False)
    assert values == {
        "state": source,
        "dispute_id": None,
        "disputed_from_state": None,
        "disputed_at": None,
    }


def test_restoring_is_safe_to_retry_but_not_for_another_dispute():
    returned = row(state="PICKED_UP")
    assert restore_values(returned, OWNER, "USER", DISPUTE, restored=True) == {}
    with pytest.raises(ApiError, match="INVALID_TRANSITION"):
        restore_values(returned, OWNER, "USER", DISPUTE, restored=False)
    with pytest.raises(ApiError, match="INVALID_TRANSITION"):
        restore_values(disputed(), OWNER, "USER", uuid4(), restored=False)


@pytest.mark.parametrize("source", ["ACCEPTED", "PICKED_UP", "DELIVERED"])
def test_accepting_fails_the_errand_with_the_reporters_reason(source):
    failure = {"reason": "OTHER", "details": "Courier never replied"}
    values = accept_dispute_values(disputed(source), ADMIN, DISPUTE, NOW, failure)
    assert values["state"] == "FAILED" and values["failed_at"] == NOW
    assert (values["failure_reason"], values["failure_details"]) == (
        "OTHER",
        "Courier never replied",
    )
    assert (values["failed_by"], values["decided_by"], values["decision_dispute_id"]) == (
        ADMIN,
        ADMIN,
        DISPUTE,
    )
    assert values["dispute_id"] is values["disputed_from_state"] is values["disputed_at"] is None


def test_accepting_replays_and_never_fails_an_errand_the_dispute_no_longer_holds():
    failed = {**disputed(), **accept_dispute_values(disputed(), ADMIN, DISPUTE, NOW, FAILURE)}
    assert accept_dispute_values(failed, uuid4(), DISPUTE, NOW, FAILURE) == {}
    for order, dispute in ((row(state="DELIVERED"), DISPUTE), (disputed(), uuid4())):
        with pytest.raises(ApiError, match="INVALID_TRANSITION"):
            accept_dispute_values(order, ADMIN, dispute, NOW, FAILURE)
    with pytest.raises(ApiError, match="INVALID_TRANSITION"):
        accept_dispute_values(row(state="COMPLETED"), ADMIN, DISPUTE, NOW, FAILURE)


def test_participants_can_no_longer_fail_an_errand_directly():
    with pytest.raises(ValueError, match="Unsupported"):
        transition_values(row(), OWNER, "fail", NOW)


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"reason": "ADMIN_DECISION", "details": "x"},
        {"reason": "OTHER"},
        {"reason": "OTHER", "details": "   "},
        {"reason": "ITEM_DAMAGED", "details": "x" * 501},
        {"reason": "ITEM_DAMAGED", "state": "FAILED"},
    ],
)
def test_accept_body_requires_a_reporter_reason(body):
    with pytest.raises(ValidationError):
        AcceptDispute.model_validate(body)


def test_failure_event_excludes_reason_details_and_actor():
    event = {
        "event_id": uuid4(),
        "event_type": "order.failed.v1",
        "order_id": uuid4(),
        "reservation_id": uuid4(),
        "occurred_at": NOW,
        "failure_reason": "ITEM_DAMAGED",
        "failure_details": "Private incident",
        "failed_by": ADMIN,
    }
    assert set(event_payload(event)) == {
        "eventId",
        "eventType",
        "orderId",
        "reservationId",
        "occurredAt",
    }


@pytest.fixture
async def service():
    clients = FakeClients(OWNER)
    repository, lifecycle = MemoryRepository(), AsyncMock()
    app = create_app(
        Settings(_env_file=None, admin_service_secret=SECRET),
        clients=clients,
        repository=repository,
        lifecycle_repository=lifecycle,
    )
    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app),
            base_url="http://test",
            headers={"Authorization": "Bearer test-only", "X-FoC-Service-Secret": SECRET},
        ) as http:
            yield http, clients, repository, lifecycle


def internal(order_id, suffix=""):
    return f"/v1/internal/orders/{order_id}/disputes{suffix}"


async def test_admin_service_holds_and_releases_errands_for_disputes(service):
    http, clients, repository, lifecycle = service
    order_id = errand(repository, created_at=BASE, state="ACCEPTED", requester=OWNER)
    lifecycle.open_dispute.return_value = lifecycle.restore.return_value = repository.rows[
        order_id
    ]
    lifecycle.accept_dispute.return_value = repository.rows[order_id]
    opened = await http.post(
        internal(order_id), json={"disputeId": str(DISPUTE), "actorType": "USER"}
    )
    assert opened.status_code == 200
    lifecycle.open_dispute.assert_awaited_with(order_id, OWNER, "USER", dispute_id=DISPUTE)
    withdrawn = await http.post(
        internal(order_id, f"/{DISPUTE}/restore"), json={"actorType": "USER"}
    )
    assert withdrawn.status_code == 200
    lifecycle.restore.assert_awaited_with(order_id, OWNER, "USER", dispute_id=DISPUTE)
    clients.role = "ADMIN"
    accepted = await http.post(
        internal(order_id, f"/{DISPUTE}/accept"),
        json={"reason": "OTHER", "details": "  Courier never replied  "},
    )
    assert accepted.status_code == 200
    lifecycle.accept_dispute.assert_awaited_with(
        order_id,
        OWNER,
        dispute_id=DISPUTE,
        failure={"reason": "OTHER", "details": "Courier never replied"},
    )


@pytest.mark.parametrize("secret", [None, "", "wrong"])
async def test_only_admin_service_reaches_dispute_routes(service, secret):
    http, _, _, lifecycle = service
    del http.headers["X-FoC-Service-Secret"]
    headers = {} if secret is None else {"X-FoC-Service-Secret": secret}
    for path, body in (
        (internal(uuid4()), {"disputeId": str(DISPUTE), "actorType": "USER"}),
        (internal(uuid4(), f"/{DISPUTE}/restore"), {"actorType": "USER"}),
        (internal(uuid4(), f"/{DISPUTE}/accept"), {"reason": "ITEM_DAMAGED"}),
    ):
        response = await http.post(path, json=body, headers=headers)
        assert (response.status_code, response.json()["error"]["code"]) == (
            401,
            "UNAUTHENTICATED_SERVICE",
        )
    lifecycle.assert_not_called()


async def test_dispute_routes_are_closed_until_configured():
    app = create_app(
        Settings(_env_file=None),
        clients=FakeClients(OWNER),
        repository=MemoryRepository(),
        lifecycle_repository=AsyncMock(),
    )
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app), base_url="http://test") as http:
            response = await http.post(
                internal(uuid4()),
                json={"disputeId": str(DISPUTE), "actorType": "USER"},
                headers={"Authorization": "Bearer t", "X-FoC-Service-Secret": ""},
            )
    assert (response.status_code, response.json()["error"]["code"]) == (
        503,
        "SERVICE_NOT_CONFIGURED",
    )


@pytest.mark.parametrize(
    "path,body",
    [
        ("", {"disputeId": str(DISPUTE), "actorType": "ADMIN"}),
        (f"/{DISPUTE}/restore", {"actorType": "ADMIN"}),
        (f"/{DISPUTE}/accept", {"reason": "ITEM_DAMAGED"}),
    ],
)
async def test_administrator_actions_need_a_current_administrator(service, path, body):
    http, _, _, lifecycle = service
    response = await http.post(internal(uuid4(), path), json=body)
    assert (response.status_code, response.json()["error"]["code"]) == (403, "FORBIDDEN")
    lifecycle.assert_not_called()


@pytest.mark.parametrize(
    "path,body",
    [
        ("", {"disputeId": str(DISPUTE)}),
        ("", {"disputeId": str(DISPUTE), "actorType": "SYSTEM"}),
        ("", {"disputeId": str(DISPUTE), "actorType": "USER", "state": "DISPUTED"}),
        (f"/{DISPUTE}/restore", {}),
        (f"/{DISPUTE}/accept", {"reason": "OTHER"}),
        ("?force=true", {"disputeId": str(DISPUTE), "actorType": "USER"}),
    ],
)
async def test_dispute_input_is_validated_before_anything_changes(service, path, body):
    http, clients, _, lifecycle = service
    clients.role = "ADMIN"
    assert (await http.post(internal(uuid4(), path), json=body)).status_code == 422
    lifecycle.assert_not_called()


async def test_participants_can_no_longer_fail_errands_or_reach_old_admin_decisions(service):
    http, clients, _, _ = service
    order_id = uuid4()
    assert (await http.post(f"/v1/orders/{order_id}/fail", json=FAILURE)).status_code in (404, 405)
    clients.role = "ADMIN"
    for action in ("fail", "complete"):
        response = await http.post(
            f"/v1/admin/orders/{order_id}/{action}", json={"disputeId": str(DISPUTE)}
        )
        assert response.status_code in (404, 405)


def decided_row(repository):
    order_id = errand(repository, created_at=BASE, state="FAILED", requester=OWNER, courier=COURIER)
    repository.rows[order_id].update(
        accepted_at=BASE,
        failed_at=BASE,
        failed_by=ADMIN,
        failure_reason="ITEM_DAMAGED",
        failure_details=None,
        decided_by=ADMIN,
        decision_dispute_id=DISPUTE,
    )
    repository.histories[order_id].append(
        dict(
            sequence=2,
            previous_state="DISPUTED",
            new_state="FAILED",
            actor_id=ADMIN,
            actor_type="ADMIN",
            occurred_at=BASE,
            failure_reason="ITEM_DAMAGED",
            failure_details=None,
            dispute_id=DISPUTE,
        )
    )
    return order_id


async def test_participants_see_the_dispute_but_never_which_administrator_decided(service):
    http, clients, repository, _ = service
    held = errand(repository, created_at=BASE, state="DISPUTED", requester=OWNER, courier=COURIER)
    repository.rows[held].update(
        accepted_at=BASE, dispute_id=DISPUTE, disputed_from_state="ACCEPTED", disputed_at=BASE
    )
    view = (await http.get(f"/v1/orders/{held}")).json()
    assert (view["state"], view["disputeId"], view["disputedFromState"]) == (
        "DISPUTED",
        str(DISPUTE),
        "ACCEPTED",
    )

    order_id = decided_row(repository)
    detail = (await http.get(f"/v1/orders/{order_id}")).json()
    assert detail["decidedByAdministrator"] is True
    assert detail["decisionDisputeId"] == str(DISPUTE)
    assert (detail["failedBy"], detail["decidedBy"]) == (None, None)
    entry = (await http.get(f"/v1/orders/{order_id}/history")).json()["items"][-1]
    assert (entry["actorType"], entry["actorId"], entry["disputeId"]) == (
        "ADMIN",
        None,
        str(DISPUTE),
    )
    clients.role, clients.actor = "ADMIN", ADMIN
    admin_entry = (await http.get(f"/v1/admin/orders/{order_id}/history")).json()["items"][-1]
    assert admin_entry["actorId"] == str(ADMIN)


async def test_legacy_administrator_failures_are_still_readable(service):
    http, clients, repository, _ = service
    order_id = decided_row(repository)
    repository.rows[order_id].update(
        failure_reason="ADMIN_DECISION", failure_details="Old decision"
    )
    repository.histories[order_id][-1].update(failure_reason="ADMIN_DECISION")
    clients.role, clients.actor = "ADMIN", ADMIN
    detail = await http.get(f"/v1/admin/orders/{order_id}")
    history = await http.get(f"/v1/admin/orders/{order_id}/history")
    assert detail.status_code == 200 and detail.json()["failureReason"] == "ADMIN_DECISION"
    assert history.json()["items"][-1]["failureReason"] == "ADMIN_DECISION"
