# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09
# Scope: Implemented and debugged creation retries and recovery tests.
# Author review: I validated correctness and added boundary checks where needed.

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from app.orders.errors import ApiError
from app.orders.schemas import CreateOrder
from app.orders.service import CreationService, digest, request_digest
from tests.order_fakes import FakeClients, MemoryRepository
from tests.test_order_contracts import body_json


async def pending():
    repo, clients = MemoryRepository(), FakeClients(uuid4())
    body = CreateOrder.model_validate(body_json())
    op = await repo.begin(
        clients.actor,
        digest("key"),
        request_digest(body),
        body,
        await clients.supplier(body.supplier_id, "test"),
    )
    return repo, clients, body, op


async def test_abort_retries_outage_and_prevents_late_reservation():
    repo, clients, body, op = await pending()
    clients.abort_unavailable = True
    service = CreationService(repo, clients, clock=lambda: body.acceptance_deadline)
    await service.recover(op["id"])
    assert repo.ops[op["id"]]["stage"] == "ABORTING"
    # An earlier in-flight reserve arrives while the abort dependency is unavailable.
    await clients.credit("reserve", op)
    clients.abort_unavailable = False
    await service.recover(op["id"])
    assert repo.ops[op["id"]]["stage"] == "ABORTED"
    assert not clients.reservations
    with pytest.raises(ApiError):
        await clients.credit("reserve", op)
    assert not repo.rows


async def test_supplier_deactivation_on_retry_compensates():
    repo, clients, body, op = await pending()
    await clients.credit("reserve", op)
    clients.supplier_error = ApiError(409, "SUPPLIER_UNAVAILABLE", "Inactive")
    with pytest.raises(ApiError):
        await CreationService(repo, clients).create(clients.actor, "test", "key", body)
    assert repo.ops[op["id"]]["stage"] == "ABORTED"
    assert not clients.reservations
    assert not repo.rows


async def test_transient_supplier_failure_does_not_abort_reserved_reward():
    repo, clients, body, op = await pending()
    await clients.credit("reserve", op)
    clients.supplier_error = ApiError(503, "SUPPLIER_UNAVAILABLE", "Unavailable")
    with pytest.raises(ApiError):
        await CreationService(repo, clients).create(clients.actor, "test", "key", body)
    assert repo.ops[op["id"]]["lease_token"] is None
    assert op["order_id"] in clients.reservations
    clients.supplier_error = None
    assert (await CreationService(repo, clients).create(clients.actor, "test", "key", body))[
        0
    ] == 201


async def test_deadline_passes_during_reserve_never_exposes_open_order():
    repo, clients, body, op = await pending()
    original = clients.credit

    async def delayed(action, operation):
        result = await original(action, operation)
        if action == "reserve":
            repo.ops[op["id"]]["acceptance_deadline"] = datetime.now(UTC) - timedelta(seconds=1)
        return result

    clients.credit = delayed
    with pytest.raises(ApiError, match="DEADLINE_PASSED"):
        await CreationService(repo, clients).create(clients.actor, "test", "key", body)
    assert repo.ops[op["id"]]["stage"] == "ABORTED"
    assert not repo.rows
    assert not clients.reservations


async def test_worker_never_uses_user_token_or_finalizes_by_itself():
    repo, clients, body, op = await pending()
    clients.auth_error = ApiError(401, "UNAUTHENTICATED", "Revoked")
    await CreationService(repo, clients).recover(op["id"])
    assert repo.ops[op["id"]]["stage"] == "READY_TO_FINALIZE"
    assert not repo.rows
    assert not {"access_token", "bearer_token", "authorization"}.intersection(repo.ops[op["id"]])


async def test_successful_operation_cannot_be_aborted_by_worker():
    repo, clients, body, op = await pending()
    assert (await CreationService(repo, clients).create(clients.actor, "test", "key", body))[
        0
    ] == 201
    await CreationService(repo, clients, clock=lambda: body.delivery_deadline).recover(op["id"])
    assert repo.ops[op["id"]]["stage"] == "SUCCEEDED"
    assert op["order_id"] in clients.reservations
