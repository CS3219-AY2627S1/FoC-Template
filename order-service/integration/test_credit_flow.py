# AI Assistance Disclosure (contributor use):
# Tool: OpenAI Codex (model not recorded), dates: 2026-10-02–2026-10-22
# Scope: Implementation, debugging, refactoring, and test assistance for Order Service modules.
# Author review: I reviewed, adapted, and tested the code. Architecture and decision-rationale assistance is not attributed.

"""Real Order/Credit HTTP + PostgreSQL; test issuer and supplier validation stub.

Only the disposable compose stack may run this suite. Kafka provisioning is not
part of this test: isolated wallets are seeded explicitly as fixture data.
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import threading
import time
from uuid import uuid4

from cryptography.hazmat.primitives.asymmetric import rsa
import httpx
import jwt
import psycopg
import pytest


pytestmark = pytest.mark.skipif(not os.getenv("CREDIT_TEST_DSN"), reason="Run the isolated integration compose stack")
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
JWK = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(KEY.public_key()))
JWK.update(kid="integration", use="sig", alg="RS256")
ORDER = "http://order-service:8000"
CREDIT = "http://credit-service:8080"
SERVICE_KEY = "isolated-integration-backend-key"


def headers(user, service=False):
    token = jwt.encode(
        {"sub": str(user), "type": "Student", "iss": "campuscouriers-user-service",
         "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
        KEY, algorithm="RS256", headers={"kid": "integration"},
    )
    result = {"Authorization": f"Bearer {token}"}
    if service:
        result["X-Order-Service-Key"] = SERVICE_KEY
    return result


@pytest.fixture(scope="module", autouse=True)
def stack():
    if not os.getenv("CREDIT_TEST_DSN"):
        yield
        return
    assert os.environ["CREDIT_TEST_DSN"].endswith("/credit_integration")
    assert os.environ["ORDER_TEST_DSN"].endswith("/order_integration")

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            body = {"keys": [JWK]} if self.path == "/.well-known/jwks.json" else {"id": self.path.rsplit("/", 1)[-1]}
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(body).encode())

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("0.0.0.0", 8099), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        deadline = time.monotonic() + 150
        while time.monotonic() < deadline:
            try:
                credit = httpx.get(f"{CREDIT}/api/wallets/availableBalance", headers=headers(uuid4()), timeout=2)
                order = httpx.get(f"{ORDER}/errands", headers=headers(uuid4()), timeout=2)
                if credit.status_code == 404 and order.status_code == 200:
                    break
            except httpx.RequestError:
                pass
            time.sleep(1)
        else:
            pytest.fail("Order/Credit stack did not become ready")
        yield
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def wallet(credits=30, status="ACTIVE"):
    user = uuid4()
    with psycopg.connect(os.environ["CREDIT_TEST_DSN"]) as db:
        db.execute(
            "INSERT INTO wallets(wallet_id,user_uuid,available_balance,reserve_balance,wallet_status) VALUES (%s,%s,%s,0,%s)",
            (uuid4(), user, credits, status),
        )
    return user


def balance(user):
    with psycopg.connect(os.environ["CREDIT_TEST_DSN"]) as db:
        return db.execute("SELECT available_balance,reserve_balance FROM wallets WHERE user_uuid=%s", (user,)).fetchone()


def payload(credit=10):
    return {"supplier_id": str(uuid4()), "required_item": "Integration coffee",
            "credit_value": credit, "delivery_building_id": str(uuid4()),
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()}


def create(user, body=None, key=None):
    auth = headers(user)
    auth["Idempotency-Key"] = key or str(uuid4())
    return httpx.post(f"{ORDER}/errand/create", json=body or payload(), headers=auth, timeout=15)


def action(name, user, errand, **extra):
    return httpx.post(f"{ORDER}/errand/{name}", headers=headers(user),
                      json={"errand_id": errand, **extra}, timeout=15)


@pytest.mark.parametrize("terminal", ["cancel", "complete", "fail"])
def test_reserve_then_release_or_transfer(terminal):
    requester, courier = wallet(), wallet()
    response = create(requester)
    assert response.status_code == 201, response.text
    errand = response.json()["id"]
    assert balance(requester) == (20, 10)
    if terminal != "cancel":
        assert action("accept", courier, errand).status_code == 200
    extra = {"failure_reason": "Missing items"} if terminal == "fail" else {}
    result = action(terminal, requester, errand, **extra)
    assert result.status_code == 200, result.text
    assert balance(requester) == ((20, 0) if terminal == "complete" else (30, 0))
    assert balance(courier) == ((40, 0) if terminal == "complete" else (30, 0))
    # Repeating an already committed terminal operation cannot pay/release twice.
    assert action(terminal, requester, errand, **extra).status_code == 409


def test_idempotent_creation_and_payload_conflict():
    requester, body, key = wallet(), payload(), str(uuid4())
    first, second = create(requester, body, key), create(requester, body, key)
    assert first.status_code == second.status_code == 201
    assert first.json() == second.json()
    assert balance(requester) == (20, 10)
    assert create(requester, {**body, "credit_value": 11}, key).status_code == 409


def test_concurrent_creations_cannot_overspend():
    requester = wallet(10)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: create(requester), range(2)))
    assert sorted(response.status_code for response in results) == [201, 409]
    assert balance(requester) == (0, 10)


@pytest.mark.parametrize("kind", ["insufficient", "suspended", "missing"])
def test_wallet_failures_do_not_create_errand(kind):
    requester = uuid4() if kind == "missing" else wallet(5 if kind == "insufficient" else 30,
                                                        "SUSPENDED" if kind == "suspended" else "ACTIVE")
    response = create(requester)
    assert response.status_code == 409, response.text
    with psycopg.connect(os.environ["ORDER_TEST_DSN"]) as db:
        assert db.execute("SELECT count(*) FROM errands WHERE requester_id=%s", (requester,)).fetchone()[0] == 0


def test_credit_requires_backend_key_and_owner_and_matching_order():
    requester, other, order = wallet(), wallet(), str(uuid4())
    body = {"userId": str(requester), "orderId": order, "amount": 5}
    url = f"{CREDIT}/api/reservations"
    assert httpx.post(url, headers=headers(requester), json=body).status_code == 403
    assert httpx.post(url, headers=headers(other, True), json=body).status_code == 403
    response = httpx.post(url, headers=headers(requester, True), json=body)
    assert response.status_code == 201, response.text
    reservation = response.json()["reservationId"]
    assert httpx.post(f"{url}/{reservation}/release", headers=headers(other, True)).status_code == 403
    wrong = httpx.post(f"{url}/{reservation}/complete", headers=headers(requester, True),
                       json={"courierUserId": str(other), "orderId": str(uuid4())})
    assert wrong.status_code == 409, wrong.text
    assert balance(requester) == (25, 5)


def test_credit_retry_is_idempotent():
    requester, order = wallet(), str(uuid4())
    body = {"userId": str(requester), "orderId": order, "amount": 5}
    auth = headers(requester, True)
    url = f"{CREDIT}/api/reservations"
    first = httpx.post(url, headers=auth, json=body)
    second = httpx.post(url, headers=auth, json=body)
    assert first.json() == second.json()
    reservation = first.json()["reservationId"]
    for _ in range(2):
        assert httpx.post(f"{url}/{reservation}/release", headers=auth).status_code == 200
    assert balance(requester) == (30, 0)


