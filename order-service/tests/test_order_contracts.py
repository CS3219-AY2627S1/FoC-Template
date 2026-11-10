# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09
# Scope: Implemented and debugged input and response validation tests.
# Author review: I validated correctness and added boundary checks where needed.

"""HTTP boundary tests use transports only; no fake client is installed at runtime."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import httpx
import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.orders.clients import ServiceClients
from app.orders.errors import ApiError
from app.orders.schemas import CreateOrder
from app.orders.service import request_digest


def body_json():
    now = datetime.now(UTC)
    return {
        "supplierId": str(uuid4()),
        "itemDescription": "Sandwich",
        "deliveryLocation": "COM3",
        "reward": 10,
        "acceptanceDeadline": (now + timedelta(hours=1)).isoformat(),
        "deliveryDeadline": (now + timedelta(hours=2)).isoformat(),
    }


@pytest.mark.parametrize(
    "field,value",
    [
        ("reward", True),
        ("reward", 1.5),
        ("reward", 0),
        ("reward", -1),
        ("reward", "10"),
        ("reward", 2_147_483_648),
        ("itemDescription", "  "),
        ("itemDescription", "x" * 1001),
        ("deliveryLocation", "x" * 301),
        ("acceptanceDeadline", "2027-01-01T12:00:00"),
        ("acceptanceDeadline", 123456789),
        ("requesterId", str(uuid4())),
        ("state", "OPEN"),
    ],
)
def test_invalid_creation_fields(field, value):
    body = body_json()
    body[field] = value
    with pytest.raises(ValidationError):
        CreateOrder.model_validate(body)


def test_deadlines_and_canonical_request_hash():
    body = body_json()
    canonical = CreateOrder.model_validate(body)
    body["itemDescription"] = " Sandwich "
    body["acceptanceDeadline"] = canonical.acceptance_deadline.isoformat().replace("+00:00", "Z")
    assert request_digest(canonical) == request_digest(CreateOrder.model_validate(body))
    body["deliveryDeadline"] = body["acceptanceDeadline"]
    with pytest.raises(ValidationError):
        CreateOrder.model_validate(body)


@pytest.mark.parametrize(
    "value",
    ["ftp://host", "https://u:p@host", "http://host/path", "http://host?token=x", "http://host#x"],
)
def test_reject_non_origin_service_urls(value):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, user_service_base_url=value)


@pytest.mark.parametrize(
    "status,payload,expected",
    [
        (401, {}, 401),
        (403, {}, 401),
        (500, {}, 503),
        (302, {}, 503),
        (200, {"userId": str(uuid4()), "systemRole": "USER", "accountStatus": "DELETED"}, 503),
        (200, {}, 503),
    ],
)
async def test_identity_fail_closed(status, payload, expected):
    settings = Settings(_env_file=None, user_service_base_url="http://user")
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(status, json=payload))
    ) as http:
        with pytest.raises(ApiError) as error:
            await ServiceClients(settings, http).identity("private-token")
        assert error.value.status == expected
        assert "private-token" not in str(error.value)


async def test_identity_uses_current_user_and_discards_profile():
    user_id = uuid4()

    def handle(request):
        assert request.url.path == "/v1/users/me"
        assert request.headers["Authorization"] == "Bearer private-token"
        return httpx.Response(
            200,
            json={
                "userId": str(user_id),
                "systemRole": "USER",
                "accountStatus": "ACTIVE",
                "email": "private@example.com",
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as http:
        principal = await ServiceClients(
            Settings(_env_file=None, user_service_base_url="http://user"),
            http,
        ).identity("private-token")
    assert principal.user_id == user_id
    assert "email" not in principal.model_dump()


def operation():
    return {"id": uuid4(), "order_id": uuid4(), "requester_id": uuid4(), "payload": {"reward": 10}}


def reservation_json(op, state="RESERVED"):
    return {
        "operationId": str(op["id"]),
        "orderId": str(op["order_id"]),
        "requesterId": str(op["requester_id"]),
        "amount": 10,
        "reservationId": str(uuid4()) if state != "CLOSED" else None,
        "state": state,
    }


@pytest.mark.parametrize(
    "field,value",
    [
        ("orderId", str(uuid4())),
        ("operationId", str(uuid4())),
        ("requesterId", str(uuid4())),
        ("amount", 11),
        ("amount", True),
        ("state", "TRANSFERRED"),
        ("reservationId", None),
    ],
)
async def test_credit_rejects_mismatched_reservation(field, value):
    op = operation()
    response = reservation_json(op)
    response[field] = value
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(200, json=response))
    ) as http:
        clients = ServiceClients(
            Settings(
                _env_file=None,
                credit_service_base_url="http://credit",
                credit_service_secret="test-only",
            ),
            http,
        )
        with pytest.raises(ApiError, match="CREDIT_CONTRACT_ERROR"):
            await clients.credit("reserve", op)


async def test_credit_timeout_is_unknown_and_abort_requires_closed_fence():
    op = operation()

    def handle(request):
        assert "Authorization" not in request.headers
        assert request.headers["X-FoC-Service-Secret"] == "test-only"
        if request.url.path.endswith("creation-abort"):
            return httpx.Response(200, json=reservation_json(op, "RELEASED"))
        raise httpx.ReadTimeout("private dependency detail")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as http:
        clients = ServiceClients(
            Settings(
                _env_file=None,
                credit_service_base_url="http://credit",
                credit_service_secret="test-only",
            ),
            http,
        )
        with pytest.raises(ApiError) as error:
            await clients.credit("reserve", op)
        assert error.value.status == 503
        assert "private dependency detail" not in str(error.value)
        with pytest.raises(ApiError, match="CREDIT_CONTRACT_ERROR"):
            await clients.credit("abort", op)


@pytest.mark.parametrize("status,expected", [(404, 409), (401, 401), (500, 503), (302, 503)])
async def test_supplier_status_handling(status, expected):
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(status))
    ) as http:
        clients = ServiceClients(
            Settings(_env_file=None, supplier_service_base_url="http://supplier"), http
        )
        with pytest.raises(ApiError) as error:
            await clients.supplier(uuid4(), "private-token")
        assert error.value.status == expected
