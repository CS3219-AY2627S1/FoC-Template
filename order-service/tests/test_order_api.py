# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09
# Scope: Implemented and debugged participant API handlers tests.
# Author review: I validated correctness and added boundary checks where needed.

from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.main import create_app
from app.orders.errors import ApiError
from app.orders.service import CreationService
from tests.order_fakes import FakeClients, MemoryRepository
from tests.test_order_contracts import body_json


@pytest.fixture
async def harness():
    clients = FakeClients(uuid4())
    repository = MemoryRepository()
    app = create_app(Settings(_env_file=None), clients=clients, repository=repository)
    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app),
            base_url="http://test",
            headers={"Authorization": "Bearer test-only"},
        ) as http:
            yield http, clients, repository


async def create(http, body=None, key="test-key"):
    return await http.post("/v1/orders", json=body or body_json(), headers={"Idempotency-Key": key})


async def test_create_replay_detail_history_and_privacy(harness):
    http, clients, repo = harness
    body = body_json()
    first = await create(http, body)
    assert first.status_code == 201, first.text
    order_id = first.json()["orderId"]
    assert first.json()["requesterId"] == str(clients.actor)
    assert "reservationId" not in first.json()
    replay = await create(http, body)
    assert replay.status_code == 200
    assert replay.json() == first.json()
    assert clients.reserve_calls == 1
    assert (await http.get(f"/v1/orders/{order_id}/history")).json()["total"] == 1
    assert (await http.get("/v1/orders/mine?relationship=requester")).json()["total"] == 1
    assert (await http.get("/v1/orders/mine?relationship=courier")).json()["total"] == 0
    clients.actor = uuid4()
    listing = (await http.get("/v1/orders")).json()["items"]
    assert len(listing) == 1
    assert "requesterId" not in listing[0]
    assert "requesterId" not in (await http.get(f"/v1/orders/{order_id}")).json()
    assert (await http.get(f"/v1/orders/{order_id}/history")).status_code == 404
    assert (await http.get("/v1/orders/mine?relationship=requester")).json()["total"] == 0


async def test_conflict_and_validation_do_not_mutate(harness):
    http, clients, repo = harness
    body = body_json()
    assert (await create(http, body)).status_code == 201
    body["reward"] = 11
    assert (await create(http, body)).status_code == 409
    body["requesterId"] = "sensitive-input"
    error = await create(http, body, "other")
    assert error.status_code == 422
    assert "sensitive-input" not in error.text
    assert len(repo.rows) == 1
    assert clients.reserve_calls == 1


@pytest.mark.parametrize(
    "url",
    [
        "/v1/orders?status=OPEN",
        "/v1/orders?pageSize=51",
        "/v1/orders/mine",
        "/v1/orders/mine?relationship=admin",
    ],
)
async def test_query_validation(harness, url):
    assert (await harness[0].get(url)).status_code == 422


async def test_admin_reads_require_current_role(harness):
    http, clients, repo = harness
    await create(http)
    requester = clients.actor
    clients.actor = uuid4()
    url = f"/v1/admin/orders?requesterId={requester}"
    assert (await http.get(url)).status_code == 403
    clients.role = "ADMIN"
    response = await http.get(url)
    assert response.status_code == 200
    assert response.json()["total"] == 1
    clients.role = "USER"
    assert (await http.get(url)).status_code == 403


async def test_timeout_recovery_and_authenticated_retry(harness):
    http, clients, repo = harness
    clients.reserve_behavior = "timeout"
    body = body_json()
    response = await create(http, body)
    assert response.status_code == 202
    assert not repo.rows
    op = next(iter(repo.ops.values()))
    await CreationService(repo, clients).recover(op["id"])
    status = await http.get(response.json()["statusUrl"])
    assert status.json()["retryCreation"] is True
    assert not repo.rows
    clients.reserve_behavior = "success"
    assert (await create(http, body)).status_code == 201
    assert len(clients.reservations) == 1


async def test_operation_private_and_replay_requires_auth(harness):
    http, clients, repo = harness
    clients.reserve_behavior = "timeout"
    response = await create(http)
    clients.actor = uuid4()
    assert (await http.get(response.json()["statusUrl"])).status_code == 404
    clients.auth_error = ApiError(401, "UNAUTHENTICATED", "Revoked")
    assert (await create(http)).status_code == 401
    assert not repo.rows


async def test_insufficient_credit_closes_attempt(harness):
    http, clients, repo = harness
    clients.reserve_behavior = "insufficient"
    body = body_json()
    response = await create(http, body)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "INSUFFICIENT_CREDIT"
    assert (await create(http, body)).status_code == 409
    assert not repo.rows


async def test_missing_credit_configuration_never_fakes_success(harness):
    http, clients, repo = harness
    clients.configured = False
    assert (await create(http)).status_code == 503
    assert not repo.ops


async def test_auth_outage_and_missing_token(harness):
    http, clients, repo = harness
    assert (await http.get("/v1/orders", headers={"Authorization": ""})).status_code == 401
    clients.auth_error = ApiError(503, "AUTH_UNAVAILABLE", "Unavailable")
    assert (await create(http)).status_code == 503
    assert not repo.ops
