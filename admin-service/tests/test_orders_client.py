# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28, 2026-10-29, 2026-11-10
# Scope: Added Order client tests for errand checks and participation; covered the internal
# dispute calls and their service credential.
# Author review: I validated correctness and supplied additional boundary checks.

import json
from uuid import uuid4

import httpx
import pytest

from app.admin.disputes import (
    DisputeAlreadyOpen,
    ErrandChanged,
    OrderNotFound,
    ReportNotAllowed,
)
from app.admin.errors import ApiError
from app.admin.orders import OrderDirectory
from app.core.config import Settings

ORDER_ID, DISPUTE_ID = uuid4(), uuid4()
SECRET = "admin-order-test-secret"


def failure(status, code):
    return httpx.Response(status, json={"error": {"code": code, "message": code}})


def directory(handler, base="http://order-service:8002", secret=SECRET):
    settings = Settings(
        _env_file=None, order_service_base_url=base, order_service_secret=secret
    )
    return OrderDirectory(settings, httpx.AsyncClient(transport=httpx.MockTransport(handler)))


async def test_forwards_the_administrator_token_to_the_admin_detail_route():
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        seen["auth"] = request.headers["Authorization"]
        return httpx.Response(200, json={"orderId": str(ORDER_ID)})

    assert await directory(handler).exists(ORDER_ID, "abc") is True
    assert seen == {
        "url": f"http://order-service:8002/v1/admin/orders/{ORDER_ID}",
        "auth": "Bearer abc",
    }


async def test_unknown_errand_is_reported_as_missing():
    assert await directory(lambda request: httpx.Response(404)).exists(ORDER_ID, "abc") is False


@pytest.mark.parametrize("status", [401, 403])
async def test_order_authorization_failures_are_passed_on(status):
    with pytest.raises(ApiError) as error:
        await directory(lambda request: httpx.Response(status)).exists(ORDER_ID, "abc")
    assert error.value.status == status


@pytest.mark.parametrize(
    "response",
    [httpx.Response(500), httpx.Response(302, headers={"Location": "http://elsewhere/"})],
)
async def test_unusable_responses_fail_closed(response):
    with pytest.raises(ApiError) as error:
        await directory(lambda request: response).exists(ORDER_ID, "abc")
    assert (error.value.status, error.value.code) == (503, "ORDER_UNAVAILABLE")


@pytest.mark.parametrize(
    "body,expected",
    [
        (
            {"state": "DELIVERED", "requesterId": "me", "courierId": "them"},
            ("REQUESTER", "DELIVERED"),
        ),
        ({"state": "FAILED", "requesterId": "them", "courierId": "me"}, ("COURIER", "FAILED")),
        ({"state": "ACCEPTED", "requesterId": "them", "courierId": "other"}, None),
        ({"state": "OPEN", "orderId": "assessment view without participants"}, None),
    ],
)
async def test_participation_comes_from_orders_participant_view(body, expected):
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        return httpx.Response(200, json=body)

    assert await directory(handler).participation(ORDER_ID, "abc", "me") == expected
    assert seen["url"] == f"http://order-service:8002/v1/orders/{ORDER_ID}"


async def test_unknown_errand_has_no_participation():
    result = await directory(lambda request: httpx.Response(404)).participation(ORDER_ID, "a", "me")
    assert result is None


@pytest.mark.parametrize("base", ["http://order-service:8002", None])
async def test_unreachable_or_unconfigured_order_service_fails_closed(base):
    def refuse(request):
        raise httpx.ConnectError("refused")

    with pytest.raises(ApiError) as error:
        await directory(refuse, base=base).exists(ORDER_ID, "abc")
    assert (error.value.status, error.value.code) == (503, "ORDER_UNAVAILABLE")


async def test_dispute_calls_carry_the_service_credential_and_the_users_session():
    seen = []

    def handler(request):
        seen.append(
            (
                request.method,
                str(request.url),
                request.headers["X-FoC-Service-Secret"],
                request.headers["Authorization"],
                json.loads(request.content),
            )
        )
        return httpx.Response(200, json={})

    orders = directory(handler)
    await orders.open_dispute(ORDER_ID, DISPUTE_ID, "USER", "user-token")
    await orders.restore(ORDER_ID, DISPUTE_ID, "ADMIN", "admin-token")
    await orders.accept(ORDER_ID, DISPUTE_ID, "OTHER", "Courier never replied", "admin-token")
    await orders.accept(ORDER_ID, DISPUTE_ID, "ITEM_DAMAGED", None, "admin-token")
    base = f"http://order-service:8002/v1/internal/orders/{ORDER_ID}/disputes"
    assert [entry[:4] for entry in seen] == [
        ("POST", base, SECRET, "Bearer user-token"),
        ("POST", f"{base}/{DISPUTE_ID}/restore", SECRET, "Bearer admin-token"),
        ("POST", f"{base}/{DISPUTE_ID}/accept", SECRET, "Bearer admin-token"),
        ("POST", f"{base}/{DISPUTE_ID}/accept", SECRET, "Bearer admin-token"),
    ]
    assert [entry[4] for entry in seen] == [
        {"disputeId": str(DISPUTE_ID), "actorType": "USER"},
        {"actorType": "ADMIN"},
        {"reason": "OTHER", "details": "Courier never replied"},
        {"reason": "ITEM_DAMAGED"},
    ]


@pytest.mark.parametrize(
    "call,response,error",
    [
        ("open", failure(409, "DISPUTE_OPEN"), DisputeAlreadyOpen),
        ("open", failure(409, "INVALID_TRANSITION"), ReportNotAllowed),
        ("restore", failure(409, "INVALID_TRANSITION"), ErrandChanged),
        ("accept", failure(409, "INVALID_TRANSITION"), ErrandChanged),
        ("accept", failure(404, "NOT_FOUND"), OrderNotFound),
    ],
)
async def test_dispute_conflicts_become_admin_errors(call, response, error):
    orders = directory(lambda request: response)
    calls = {
        "open": lambda: orders.open_dispute(ORDER_ID, DISPUTE_ID, "USER", "t"),
        "restore": lambda: orders.restore(ORDER_ID, DISPUTE_ID, "USER", "t"),
        "accept": lambda: orders.accept(ORDER_ID, DISPUTE_ID, "ITEM_DAMAGED", None, "t"),
    }
    with pytest.raises(error):
        await calls[call]()


@pytest.mark.parametrize(
    "response",
    [failure(401, "UNAUTHENTICATED_SERVICE"), failure(503, "SERVICE_NOT_CONFIGURED")],
)
async def test_a_rejected_service_credential_is_an_outage_not_the_callers_fault(response):
    with pytest.raises(ApiError) as error:
        await directory(lambda request: response).restore(ORDER_ID, DISPUTE_ID, "USER", "t")
    assert (error.value.status, error.value.code) == (503, "ORDER_UNAVAILABLE")


async def test_dispute_calls_need_a_configured_credential():
    def never(request):
        raise AssertionError("Order must not be called without a credential")

    with pytest.raises(ApiError) as error:
        await directory(never, secret=None).open_dispute(ORDER_ID, DISPUTE_ID, "USER", "t")
    assert (error.value.status, error.value.code) == (503, "ORDER_UNAVAILABLE")
