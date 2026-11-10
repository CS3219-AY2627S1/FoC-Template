# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-13
# Scope: Added tests for the Order-facing reservation endpoints.
# Author review: I validated correctness and supplied additional boundary checks.

from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.credits.errors import (
    IdentityConflict,
    InsufficientCredit,
    SettlementConflict,
    WalletNotReady,
)
from app.main import create_app
from tests.credit_fakes import FakeLedger
from tests.test_health import NoDatabase

SECRET = "order-to-credit-test-secret"
HEADERS = {"X-FoC-Service-Secret": SECRET}
# Order's Reservation model forbids extra fields, so the response must be exactly these.
CONTRACT_KEYS = {"operationId", "orderId", "requesterId", "amount", "reservationId", "state"}


@pytest.fixture
def ledger():
    return FakeLedger()


def client_for(ledger, secret=SECRET):
    settings = Settings(_env_file=None, order_service_secret=secret)
    app = create_app(settings, NoDatabase(), ledger=ledger)
    return AsyncClient(transport=ASGITransport(app), base_url="http://test")


def body():
    return {"operationId": str(uuid4()), "requesterId": str(uuid4()), "amount": 10}


def path(order_id=None, suffix=""):
    return f"/v1/internal/order-reservations/{order_id or uuid4()}{suffix}"


async def test_rejects_missing_or_wrong_service_secret(ledger):
    async with client_for(ledger) as client:
        missing = await client.put(path(), json=body())
        wrong = await client.put(path(), json=body(), headers={"X-FoC-Service-Secret": "nope"})
        user_token = await client.get(path(), headers={"Authorization": "Bearer user-token"})
    assert missing.status_code == wrong.status_code == user_token.status_code == 401
    assert wrong.json()["error"]["code"] == "UNAUTHENTICATED_SERVICE"
    assert ledger.calls == []


async def test_unconfigured_secret_fails_closed(ledger):
    async with client_for(ledger, secret=None) as client:
        response = await client.put(path(), json=body(), headers={"X-FoC-Service-Secret": ""})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "SERVICE_NOT_CONFIGURED"
    assert ledger.calls == []


async def test_reserve_returns_exact_contract(ledger):
    order_id = uuid4()
    request = body()
    async with client_for(ledger) as client:
        first = await client.put(path(order_id), json=request, headers=HEADERS)
        ledger.created = False
        replay = await client.put(path(order_id), json=request, headers=HEADERS)
    assert first.status_code == 201 and replay.status_code == 200
    assert set(first.json()) == CONTRACT_KEYS
    assert first.json()["state"] == "RESERVED"
    assert first.json()["orderId"] == str(order_id)
    assert first.json()["operationId"] == request["operationId"]
    assert first.json()["amount"] == 10


@pytest.mark.parametrize(
    "error", [InsufficientCredit(), WalletNotReady(), IdentityConflict()]
)
async def test_definitive_rejections_use_contract_codes(ledger, error):
    ledger.error = error
    async with client_for(ledger) as client:
        response = await client.put(path(), json=body(), headers=HEADERS)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == error.code
    assert set(response.json()["error"]) == {"code", "message", "correlationId", "fieldErrors"}


@pytest.mark.parametrize(
    "change",
    [
        {"courierId": str(uuid4())},
        {"amount": 1.5},
        {"amount": "10"},
        {"amount": 0},
        {"requesterId": "not-a-uuid"},
    ],
)
async def test_rejects_invalid_bodies(ledger, change):
    async with client_for(ledger) as client:
        response = await client.put(path(), json={**body(), **change}, headers=HEADERS)
    assert response.status_code == 422
    assert ledger.calls == []


async def test_status_returns_current_reservation_or_404(ledger):
    order_id = uuid4()
    async with client_for(ledger) as client:
        absent = await client.get(path(order_id), headers=HEADERS)
        ledger.reservation = {
            "operation_id": uuid4(),
            "order_id": order_id,
            "requester_id": uuid4(),
            "amount": 5,
            "reservation_id": uuid4(),
            "state": "TRANSFERRED",
        }
        present = await client.get(path(order_id), headers=HEADERS)
    assert absent.status_code == 404
    assert present.status_code == 200 and present.json()["state"] == "TRANSFERRED"
    assert set(present.json()) == CONTRACT_KEYS


async def test_abort_returns_closed(ledger):
    async with client_for(ledger) as client:
        response = await client.put(
            path(suffix="/creation-abort"), json=body(), headers=HEADERS
        )
    assert response.status_code == 201
    assert response.json()["state"] == "CLOSED" and response.json()["reservationId"] is None


async def test_abort_after_transfer_conflicts(ledger):
    ledger.error = SettlementConflict()
    async with client_for(ledger) as client:
        response = await client.put(
            path(suffix="/creation-abort"), json=body(), headers=HEADERS
        )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "SETTLEMENT_CONFLICT"
