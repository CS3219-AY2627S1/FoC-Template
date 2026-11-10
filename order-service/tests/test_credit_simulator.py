# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-11
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11, 2026-10-16
# Scope: Implemented and debugged Credit test-double behavior and test-only packaging tests.
# Author review: I validated correctness and added boundary checks where needed.

"""Test-only simulator contract checks, never substituted into the production app."""

import tomllib
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import httpx
import pytest

from app.core.config import Settings
from app.orders.clients import ServiceClients
from app.orders.errors import ApiError
from tests.credit_fake import Request, Store, StubError, TerminalEvent, create_app


@pytest.fixture
def store(tmp_path):
    return Store(str(tmp_path / "simulation.sqlite"))


@pytest.fixture
def operation():
    return {"id": uuid4(), "order_id": uuid4(), "requester_id": uuid4(), "payload": {"reward": 10}}


def request(operation):
    return Request(operationId=operation["id"], requesterId=operation["requester_id"], amount=10)


def terminal(value, kind="order.cancelled.v1"):
    return TerminalEvent(
        eventId=uuid4(),
        eventType=kind,
        orderId=value["orderId"],
        reservationId=value["reservationId"],
        occurredAt=datetime.now(UTC),
    )


async def test_real_order_http_client_and_simulator_contract(store, operation):
    app = create_app(store, "test-secret")
    settings = Settings(
        _env_file=None,
        credit_service_base_url="http://simulator",
        credit_service_secret="test-secret",
    )
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app)) as http:
        client = ServiceClients(settings, http)
        assert await client.credit("status", operation) is None
        reservation = await client.credit("reserve", operation)
        assert reservation.state == "RESERVED"
        assert await client.credit("reserve", operation) == reservation
        assert await client.credit("status", operation) == reservation
        assert (await client.credit("abort", operation)).state == "CLOSED"


@pytest.mark.parametrize(
    "mode,code",
    [
        ("insufficient_credit", "INSUFFICIENT_CREDIT"),
        ("wallet_not_ready", "WALLET_NOT_READY"),
        ("unavailable", "CREDIT_UNAVAILABLE"),
    ],
)
async def test_simulated_failure_never_creates_reservation(store, operation, mode, code):
    app = create_app(store, "test-secret", mode=mode)
    settings = Settings(
        _env_file=None,
        credit_service_base_url="http://simulator",
        credit_service_secret="test-secret",
    )
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app)) as http:
        with pytest.raises(ApiError) as raised:
            await ServiceClients(settings, http).credit("reserve", operation)
        assert raised.value.code == code
    assert store.get(operation["order_id"]) is None


async def test_secret_and_payload_validation(store, operation):
    app = create_app(store, "test-secret")
    path = f"http://simulator/v1/internal/order-reservations/{operation['order_id']}"
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app)) as http:
        body = request(operation).model_dump(mode="json")
        assert (await http.put(path, json=body)).status_code == 401
        denied = await http.put(path, json=body, headers={"X-FoC-Service-Secret": "wrong"})
        assert denied.status_code == 401
        for invalid in ({**body, "amount": 1.5}, {**body, "state": "RESERVED"}):
            response = await http.put(
                path, json=invalid, headers={"X-FoC-Service-Secret": "test-secret"}
            )
            assert response.status_code == 422
    assert store.get(operation["order_id"]) is None


def test_credit_fake_is_test_only_not_a_deployment_entrypoint():
    from tests import credit_fake

    root = Path(__file__).resolve().parents[1]
    project = tomllib.loads((root / "pyproject.toml").read_text(encoding="utf-8"))
    assert project["tool"]["setuptools"]["packages"]["find"]["include"] == ["app*"]
    assert "tests" in Path(credit_fake.__file__).parts
    assert not hasattr(credit_fake, "from_environment")


def test_abort_before_reserve_is_a_durable_fence(store, operation):
    closed = store.change(operation["order_id"], request(operation), abort=True)
    restarted = Store(store.path)
    assert restarted.change(operation["order_id"], request(operation)) == closed
    assert closed["state"] == "CLOSED"
    assert closed["reservationId"] is None


@pytest.mark.parametrize(
    "field,value", [("amount", 11), ("requesterId", uuid4()), ("operationId", uuid4())]
)
def test_conflicting_identity_cannot_replace_reservation(store, operation, field, value):
    original = store.change(operation["order_id"], request(operation))
    changed = request(operation).model_copy(update={field: value})
    with pytest.raises(StubError):
        store.change(operation["order_id"], changed)
    assert store.get(operation["order_id"]) == original


def test_concurrent_reserve_retries_share_one_identity(store, operation):
    with ThreadPoolExecutor(max_workers=10) as pool:
        results = list(
            pool.map(lambda _: store.change(operation["order_id"], request(operation)), range(20))
        )
    assert len({item["reservationId"] for item in results}) == 1


@pytest.mark.parametrize("kind", ["order.cancelled.v1", "order.expired.v1", "order.failed.v1"])
def test_terminal_release_persists_and_deduplicates(store, operation, kind):
    value = store.change(operation["order_id"], request(operation))
    event = terminal(value, kind)
    store.release(event)
    restarted = Store(store.path)
    restarted.release(event)
    assert restarted.get(operation["order_id"])["state"] == "RELEASED"
    with restarted.connect() as db:
        assert db.execute("SELECT count(*) FROM events").fetchone()[0] == 1


def test_unknown_release_cannot_change_other_reservation(store, operation):
    value = store.change(operation["order_id"], request(operation))
    event = terminal(value).model_copy(update={"reservationId": uuid4()})
    with pytest.raises(ValueError):
        store.release(event)
    assert store.get(operation["order_id"]) == value
    with store.connect() as db:
        assert db.execute("SELECT count(*) FROM events").fetchone()[0] == 0


def test_terminal_retry_does_not_reopen_a_closed_fence(store, operation):
    value = store.change(operation["order_id"], request(operation))
    closed = store.change(operation["order_id"], request(operation), abort=True)
    store.release(terminal(value))
    assert store.change(operation["order_id"], request(operation)) == closed


def completion(value):
    return TerminalEvent(
        eventId=uuid4(),
        eventType="order.completed.v1",
        orderId=value["orderId"],
        reservationId=value["reservationId"],
        occurredAt=datetime.now(UTC),
        requesterId=value["requesterId"],
        courierId=uuid4(),
        amount=value["amount"],
    )


async def test_completion_transfer_persists_and_keeps_http_contract(store, operation):
    value = store.change(operation["order_id"], request(operation))
    event = completion(value)
    store.release(event)
    restarted = Store(store.path)
    restarted.release(event)
    assert restarted.get(operation["order_id"])["state"] == "TRANSFERRED"
    assert restarted.get(operation["order_id"])["courierId"] == str(event.courierId)
    app = create_app(restarted, "test-secret")
    settings = Settings(
        _env_file=None,
        credit_service_base_url="http://simulator",
        credit_service_secret="test-secret",
    )
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app)) as http:
        result = await ServiceClients(settings, http).credit("status", operation)
    assert result.state == "TRANSFERRED"
    with restarted.connect() as db:
        assert db.execute("SELECT count(*) FROM events").fetchone()[0] == 1


@pytest.mark.parametrize("field,value", [("amount", 99), ("requesterId", uuid4())])
def test_simulated_transfer_rejects_mismatched_reservation(store, operation, field, value):
    original = store.change(operation["order_id"], request(operation))
    with pytest.raises(ValueError):
        store.release(completion(original).model_copy(update={field: value}))
    assert store.get(operation["order_id"]) == original


def test_transfer_never_releases_or_retargets_after_settlement(store, operation):
    original = store.change(operation["order_id"], request(operation))
    event = completion(original)
    store.release(event)
    store.release(terminal(original))
    assert store.get(operation["order_id"])["state"] == "TRANSFERRED"
    with pytest.raises(ValueError):
        store.release(completion(original))  # Different courier cannot receive a second transfer.
    with pytest.raises(StubError):
        store.change(operation["order_id"], request(operation), abort=True)


@pytest.mark.parametrize("abort", [True, False])
def test_closed_or_released_reservation_cannot_transfer(store, operation, abort):
    original = store.change(operation["order_id"], request(operation))
    if abort:
        store.change(operation["order_id"], request(operation), abort=True)
    else:
        store.release(terminal(original))
    with pytest.raises(ValueError):
        store.release(completion(original))
