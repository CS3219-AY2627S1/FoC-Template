# AI Assistance Disclosure (contributor use):
# Tool: OpenAI Codex (model not recorded), dates: 2026-10-02–2026-10-22
# Scope: Implementation, debugging, refactoring, and test assistance for Order Service modules.
# Author review: I reviewed, adapted, and tested the code. Architecture and decision-rationale assistance is not attributed.

from uuid import uuid4

import httpx
import pytest
from fastapi import HTTPException

from main.credit_client import CreditClient


@pytest.fixture
def transport(monkeypatch):
    requests = []
    result = {"status": 200, "body": {"availableBalance": 30}, "exception": None}
    original_client = httpx.Client

    def handle(request):
        requests.append(request)
        if result["exception"]:
            raise result["exception"]
        return httpx.Response(result["status"], json=result["body"])

    monkeypatch.setenv("ORDER_CREDIT_SERVICE_KEY", "test-backend-key")
    monkeypatch.setattr(httpx, "Client", lambda **kwargs: original_client(
        **kwargs, transport=httpx.MockTransport(handle),
    ))
    return requests, result


def test_balance_uses_authenticated_identity(transport):
    requests, _ = transport
    assert CreditClient("user-token").available_balance() == 30
    assert requests[0].url.path == "/api/wallets/availableBalance"
    assert requests[0].headers["authorization"] == "Bearer user-token"
    assert "x-order-service-key" not in requests[0].headers


@pytest.mark.parametrize("action,state", [("reserve", "HELD"), ("release", "RELEASED"), ("complete", "TRANSFERRED")])
def test_reservation_payloads_headers_and_response(transport, action, state):
    requests, result = transport
    owner, order, reservation, courier = (uuid4() for _ in range(4))
    result.update(status=201 if action == "reserve" else 200,
                  body={"reservationId": str(reservation), "orderId": str(order), "amount": 10, "status": state})
    client = CreditClient("user-token")
    if action == "reserve":
        response = client.reserve(owner, order, 10)
        expected = {"userId": str(owner), "orderId": str(order), "amount": 10}
    elif action == "release":
        response = client.release(reservation, order, 10)
        expected = None
    else:
        response = client.complete(reservation, order, 10, courier)
        expected = {"courierUserId": str(courier), "orderId": str(order)}
    assert response.reservation_id == reservation
    assert requests[0].headers["x-order-service-key"] == "test-backend-key"
    import json
    assert (json.loads(requests[0].content) if requests[0].content else None) == expected
    expected_path = "/api/reservations" if action == "reserve" else f"/api/reservations/{reservation}/{action}"
    assert requests[0].url.path == expected_path


@pytest.mark.parametrize("code,expected", [(400, 409), (404, 409), (409, 409), (401, 401), (403, 403), (500, 503), (429, 503)])
def test_upstream_errors_are_not_silently_treated_as_success(transport, code, expected):
    _, result = transport
    result.update(status=code, body={"detail": "Credit failure"})
    with pytest.raises(HTTPException) as error:
        CreditClient("token").available_balance()
    assert error.value.status_code == expected


@pytest.mark.parametrize("body", [{}, [], {"availableBalance": True}, {"availableBalance": -1}, {"availableBalance": "30"}])
def test_invalid_balance_response(transport, body):
    _, result = transport
    result["body"] = body
    with pytest.raises(HTTPException) as error:
        CreditClient("token").available_balance()
    assert error.value.status_code == 502


@pytest.mark.parametrize("changes", [
    {"orderId": str(uuid4())}, {"amount": 11}, {"amount": True},
    {"status": "RELEASED"}, {"reservationId": "invalid"},
])
def test_mismatched_reservation_response(transport, changes):
    _, result = transport
    order = uuid4()
    result.update(status=201, body={"reservationId": str(uuid4()), "orderId": str(order),
                                    "amount": 10, "status": "HELD", **changes})
    with pytest.raises(HTTPException) as error:
        CreditClient("token").reserve(uuid4(), order, 10)
    assert error.value.status_code == 502


def test_timeout_is_unknown_outcome_not_insufficient_balance(transport):
    _, result = transport
    result["exception"] = httpx.ReadTimeout("response lost")
    with pytest.raises(HTTPException) as error:
        CreditClient("token").reserve(uuid4(), uuid4(), 10)
    assert error.value.status_code == 503


def test_missing_backend_secret_fails_closed(transport, monkeypatch):
    requests, _ = transport
    monkeypatch.delenv("ORDER_CREDIT_SERVICE_KEY")
    with pytest.raises(HTTPException) as error:
        CreditClient("token").reserve(uuid4(), uuid4(), 10)
    assert error.value.status_code == 503
    assert requests == []


