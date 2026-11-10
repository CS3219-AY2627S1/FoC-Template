# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-11
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11
# Scope: Implemented and debugged acceptance, cancellation and expiry tests.
# Author review: I validated correctness and added boundary checks where needed.

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.main import create_app
from app.orders.errors import ApiError
from app.orders.lifecycle import transition_values
from tests.order_fakes import FakeClients

NOW = datetime(2030, 1, 1, tzinfo=UTC)
OWNER, COURIER = uuid4(), uuid4()


def row(**changes):
    return dict(
        {
            "requester_id": OWNER,
            "courier_id": None,
            "state": "OPEN",
            "accepted_at": None,
            "acceptance_deadline": NOW + timedelta(seconds=1),
        },
        **changes,
    )


@pytest.mark.parametrize(
    "action,actor,state", [("accept", COURIER, "ACCEPTED"), ("cancel", OWNER, "CANCELLED")]
)
def test_eligible_transition(action, actor, state):
    order = row()
    assert transition_values(order, actor, action, NOW)["state"] == state
    assert order["state"] == "OPEN"  # Rules do not mutate their input.


@pytest.mark.parametrize("action,actor", [("accept", COURIER), ("cancel", OWNER)])
@pytest.mark.parametrize("offset", [0, -1])
def test_equality_and_past_deadline_rejected(action, actor, offset):
    with pytest.raises(ApiError) as error:
        transition_values(
            row(acceptance_deadline=NOW + timedelta(seconds=offset)), actor, action, NOW
        )
    assert error.value.code == "DEADLINE_PASSED"


def test_self_accept_and_unrelated_cancel():
    with pytest.raises(ApiError) as error:
        transition_values(row(), OWNER, "accept", NOW)
    assert error.value.status == 403
    with pytest.raises(ApiError) as error:
        transition_values(row(), COURIER, "cancel", NOW)
    assert error.value.status == 404


@pytest.mark.parametrize(
    "state", ["ACCEPTED", "PICKED_UP", "DELIVERED", "COMPLETED", "CANCELLED", "EXPIRED", "FAILED"]
)
def test_other_courier_cannot_accept_nonopen(state):
    with pytest.raises(ApiError) as error:
        transition_values(row(state=state), COURIER, "accept", NOW)
    assert error.value.code == "ORDER_NOT_OPEN"


@pytest.mark.parametrize(
    "state", ["ACCEPTED", "PICKED_UP", "DELIVERED", "COMPLETED", "EXPIRED", "FAILED"]
)
def test_requester_cannot_cancel_nonopen(state):
    with pytest.raises(ApiError) as error:
        transition_values(row(state=state), OWNER, "cancel", NOW)
    assert error.value.code == "ORDER_NOT_OPEN"


@pytest.mark.parametrize("state", ["ACCEPTED", "PICKED_UP", "DELIVERED", "COMPLETED", "FAILED"])
def test_same_courier_retry_returns_current_result_even_after_deadline(state):
    assert (
        transition_values(
            row(state=state, courier_id=COURIER, accepted_at=NOW),
            COURIER,
            "accept",
            NOW + timedelta(days=1),
        )
        == {}
    )


def test_cancellation_replay_even_after_deadline():
    assert transition_values(row(state="CANCELLED"), OWNER, "cancel", NOW + timedelta(days=1)) == {}


@pytest.fixture(name="api")
async def api():
    clients = FakeClients(COURIER)
    lifecycle = AsyncMock()
    app = create_app(Settings(_env_file=None), clients=clients, lifecycle_repository=lifecycle)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app), base_url="http://test") as http:
            yield http, clients, lifecycle


@pytest.mark.parametrize("action", ["accept", "cancel", "pickup", "deliver", "complete"])
async def test_action_requires_current_authentication(api, action):
    http, clients, lifecycle = api
    path = f"/v1/orders/{uuid4()}/{action}"
    assert (await http.post(path)).status_code == 401
    clients.auth_error = ApiError(401, "UNAUTHENTICATED", "Revoked")
    assert (await http.post(path, headers={"Authorization": "Bearer revoked"})).status_code == 401
    clients.auth_error = ApiError(503, "AUTH_UNAVAILABLE", "Unavailable")
    assert (await http.post(path, headers={"Authorization": "Bearer test"})).status_code == 503
    lifecycle.transition.assert_not_awaited()


@pytest.mark.parametrize("action", ["accept", "cancel", "pickup", "deliver", "complete"])
@pytest.mark.parametrize(
    "body", [{"courierId": str(COURIER)}, {"state": "ACCEPTED"}, [], "bad", {"actorId": str(OWNER)}]
)
async def test_rejects_client_owned_state_identity_and_nonobjects(api, action, body):
    http, _, lifecycle = api
    response = await http.post(
        f"/v1/orders/{uuid4()}/{action}", json=body, headers={"Authorization": "Bearer test"}
    )
    assert response.status_code == 422
    lifecycle.transition.assert_not_awaited()


@pytest.mark.parametrize("action", ["accept", "cancel", "pickup", "deliver", "complete"])
async def test_malformed_body_query_and_id_rejected(api, action):
    http, _, lifecycle = api
    headers = {"Authorization": "Bearer test"}
    path = f"/v1/orders/{uuid4()}/{action}"
    assert (await http.post(path, content="{", headers=headers)).status_code == 422
    assert (await http.post(path + "?requesterId=bad", headers=headers)).status_code == 422
    assert (await http.post(f"/v1/orders/bad/{action}", headers=headers)).status_code == 422
    lifecycle.transition.assert_not_awaited()


@pytest.mark.parametrize("action", ["accept", "cancel", "pickup", "deliver", "complete"])
async def test_no_administrator_mutation_bypass(api, action):
    http, clients, lifecycle = api
    clients.role = "SUPER_ADMIN"
    lifecycle.transition.side_effect = ApiError(409, "ORDER_NOT_OPEN", "Unavailable")
    order_id = uuid4()
    response = await http.post(
        f"/v1/orders/{order_id}/{action}", json={}, headers={"Authorization": "Bearer test"}
    )
    assert response.status_code == 409
    lifecycle.transition.assert_awaited_once_with(order_id, COURIER, action)
