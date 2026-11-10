# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-13
# Scope: Added tests for wallet, history and admin lookup endpoints.
# Author review: I validated correctness and supplied additional boundary checks.

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.credits.errors import ApiError
from app.main import create_app
from tests.credit_fakes import FakeIdentity, FakeLedger, wallet_row
from tests.test_health import NoDatabase

AUTH = {"Authorization": "Bearer user-token"}


def client_for(ledger, identity):
    app = create_app(Settings(_env_file=None), NoDatabase(), ledger=ledger, identity=identity)
    return AsyncClient(transport=ASGITransport(app), base_url="http://test")


def transaction(owner, kind="ALLOCATION", counterparty=None) -> dict:
    return {
        "id": uuid4(),
        "type": kind,
        "amount": 20,
        "wallet_user_id": owner,
        "counterparty_user_id": counterparty,
        "order_id": None if kind == "ALLOCATION" else uuid4(),
        "reservation_id": None,
        "source_event_id": None,
        "created_at": datetime.now(UTC),
    }


@pytest.mark.parametrize(
    "headers", [{}, {"Authorization": "Basic abc"}, {"Authorization": "Bearer "}]
)
async def test_requires_bearer_token(headers):
    ledger, identity = FakeLedger(), FakeIdentity()
    async with client_for(ledger, identity) as client:
        response = await client.get("/v1/wallets/me", headers=headers)
    assert response.status_code == 401
    assert identity.tokens == [] and ledger.calls == []


async def test_own_wallet_is_get_or_created_and_reports_total_as_sum():
    ledger, identity = FakeLedger(), FakeIdentity()
    ledger.wallet_row = wallet_row(identity.principal.user_id, available=70, reserved=30)
    async with client_for(ledger, identity) as client:
        response = await client.get("/v1/wallets/me", headers=AUTH)
    assert response.status_code == 200
    body = response.json()
    assert (body["available"], body["reserved"], body["total"]) == (70, 30, 100)
    assert body["userId"] == str(identity.principal.user_id)
    assert set(body) == {"userId", "available", "reserved", "total", "updatedAt"}
    # M4F2.1.1: the wallet looked up is always the authenticated user's.
    assert ledger.calls == [("owner_wallet", identity.principal.user_id)]
    assert identity.tokens == ["user-token"]


async def test_missing_wallet_without_configured_allocation_is_not_ready():
    async with client_for(FakeLedger(), FakeIdentity()) as client:
        response = await client.get("/v1/wallets/me", headers=AUTH)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "WALLET_NOT_READY"


async def test_history_is_paged_for_owner_only():
    ledger, identity = FakeLedger(), FakeIdentity()
    owner = identity.principal.user_id
    ledger.wallet_row = wallet_row(owner)
    ledger.history_rows = ([transaction(owner)], 1)
    async with client_for(ledger, identity) as client:
        response = await client.get("/v1/wallets/me/transactions?page=2&pageSize=5", headers=AUTH)
    assert response.status_code == 200
    body = response.json()
    assert (body["page"], body["pageSize"], body["total"]) == (2, 5, 1)
    assert body["items"][0]["type"] == "ALLOCATION"
    assert set(body["items"][0]) == {
        "transactionId",
        "type",
        "amount",
        "walletUserId",
        "counterpartyUserId",
        "orderId",
        "createdAt",
    }
    assert ledger.calls == [("owner_wallet", owner), ("history", owner, 2, 5)]


@pytest.mark.parametrize("query", ["page=0", "pageSize=51", "pageSize=0", "userId=x"])
async def test_history_rejects_invalid_paging(query):
    ledger = FakeLedger()
    async with client_for(ledger, FakeIdentity()) as client:
        response = await client.get(f"/v1/wallets/me/transactions?{query}", headers=AUTH)
    assert response.status_code == 422
    assert ledger.calls == []


async def test_user_cannot_use_admin_routes():
    target = uuid4()
    ledger = FakeLedger()
    async with client_for(ledger, FakeIdentity("USER")) as client:
        wallet = await client.get(f"/v1/admin/wallets/{target}", headers=AUTH)
        history = await client.get(f"/v1/admin/wallets/{target}/transactions", headers=AUTH)
    assert wallet.status_code == history.status_code == 403
    assert ledger.calls == []


@pytest.mark.parametrize("role", ["ADMIN", "SUPER_ADMIN"])
async def test_admin_lookup_is_read_only(role):
    target = uuid4()
    ledger = FakeLedger()
    ledger.wallet_row = wallet_row(target)
    ledger.history_rows = ([transaction(target)], 1)
    async with client_for(ledger, FakeIdentity(role)) as client:
        wallet = await client.get(f"/v1/admin/wallets/{target}", headers=AUTH)
        history = await client.get(f"/v1/admin/wallets/{target}/transactions", headers=AUTH)
    assert wallet.status_code == history.status_code == 200
    # Never get-or-create for an arbitrary ID.
    assert ledger.calls == [("wallet", target), ("history", target, 1, 20)]


async def test_admin_lookup_of_unknown_wallet_is_404():
    async with client_for(FakeLedger(), FakeIdentity("ADMIN")) as client:
        response = await client.get(f"/v1/admin/wallets/{uuid4()}", headers=AUTH)
    assert response.status_code == 404


async def test_identity_outage_is_503():
    identity = FakeIdentity()
    identity.error = ApiError(503, "AUTH_UNAVAILABLE", "A required service is unavailable.")
    async with client_for(FakeLedger(), identity) as client:
        response = await client.get("/v1/wallets/me", headers=AUTH)
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "AUTH_UNAVAILABLE"
