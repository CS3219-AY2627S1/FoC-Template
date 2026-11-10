# AI Assistance Disclosure (hwangjihun):
# Tool: ChatGPT (Codex, model: gpt-6-sol), date: 2026-09-23, 2026-09-24
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-21
# Scope: Generated and refined Supplier regression tests and test fixtures.
# Author review: I validated correctness, and added boundary checks.

"""HTTP checks for supplier creation, including current-role enforcement."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app import auth
from app.config import Settings, get_settings
from app.main import app
from app.repository import get_repository
from app.schemas import SupplierResponse


@pytest.fixture
def setup(monkeypatch):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = uuid4()
    session = uuid4()
    token = jwt.encode(
        {
            "iss": "foc-user-service",
            "aud": "foc-services",
            "exp": datetime.now(UTC) + timedelta(minutes=10),
            "iat": datetime.now(UTC),
            "sub": str(subject),
            "sid": str(session),
            "roleVersion": 1,
        },
        key,
        algorithm="RS256",
        headers={"kid": "test-key"},
    )

    class FakeJwks:
        def get_signing_key_from_jwt(self, _token):
            return SimpleNamespace(key=key.public_key())

    monkeypatch.setattr(auth, "jwks_client", lambda _url: FakeJwks())
    calls = []

    def authorize(url, *, headers, json, timeout):
        calls.append((url, headers, json, timeout))
        return SimpleNamespace(
            status_code=200,
            json=lambda: {
                "subjectId": str(subject),
                "accountStatus": "ACTIVE",
                "systemRole": "ADMIN",
                "allowed": True,
            },
        )

    monkeypatch.setattr(auth.httpx, "post", authorize)
    app.dependency_overrides[get_settings] = lambda: Settings(
        database_url="unused-in-http-test",
        user_service_base_url="http://user-service:8000",
        supplier_service_shared_secret="test-service-secret",
        jwt_issuer="foc-user-service",
        jwt_audience="foc-services",
    )

    class FakeRepository:
        payload = None

        def create(self, supplier):
            self.payload = supplier
            return SupplierResponse(
                id=uuid4(),
                name=supplier.name,
                categories=supplier.categories,
                building_area=supplier.building_area,
                pickup_location_description=supplier.pickup_location_description,
                floor=supplier.floor,
                latitude=supplier.latitude,
                longitude=supplier.longitude,
                opening_time=supplier.opening_time,
                closing_time=supplier.closing_time,
                image_url=str(supplier.image_url) if supplier.image_url else None,
                status=supplier.status,
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )

    repository = FakeRepository()
    app.dependency_overrides[get_repository] = lambda: repository
    with TestClient(app) as client:
        yield client, token, subject, calls, repository
    app.dependency_overrides.clear()


def body():
    return {
        "name": " Example Cafe ",
        "categories": ["FOOD", "COFFEE"],
        "building_area": "Central Library",
        "pickup_location_description": "Beside the entrance",
        "opening_time": "09:00",
        "closing_time": "18:00",
    }


def post(client, token, payload):
    return client.post(
        "/api/v1/admin/suppliers",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )


def test_admin_create_calls_current_role_contract_and_returns_record(setup):
    client, token, _subject, calls, repository = setup
    response = post(client, token, body())
    assert response.status_code == 201
    assert response.json()["name"] == "Example Cafe"
    assert response.json()["categories"] == ["FOOD", "COFFEE"]
    assert response.json()["status"] == "ACTIVE"
    assert repository.payload is not None
    assert calls[0][0] == "http://user-service:8000/v1/internal/authorization-decisions"
    assert calls[0][1]["Authorization"] == f"Bearer {token}"
    assert calls[0][1]["X-FoC-Service-Secret"] == "test-service-secret"
    assert calls[0][2] == {"action": "SUPPLIER_CREATE"}


def test_non_admin_never_reaches_database(setup, monkeypatch):
    client, token, subject, _calls, repository = setup
    monkeypatch.setattr(
        auth.httpx,
        "post",
        lambda *args, **kwargs: SimpleNamespace(
            status_code=200,
            json=lambda: {
                "subjectId": str(subject),
                "accountStatus": "ACTIVE",
                "systemRole": "USER",
                "allowed": False,
            },
        ),
    )
    response = post(client, token, body())
    assert response.status_code == 403
    assert repository.payload is None


def test_missing_or_invalid_token_is_rejected(setup):
    client, _token, _subject, _calls, repository = setup
    assert client.post("/api/v1/admin/suppliers", json=body()).status_code == 401
    assert post(client, "not-a-jwt", body()).status_code == 401
    assert repository.payload is None


@pytest.mark.parametrize(
    "change",
    [
        {"name": " \t "},
        {"categories": []},
        {"categories": ["FOOD", "FOOD"]},
        {"opening_time": "9:00"},
        {"latitude": 1.3},
        {"latitude": "1.3", "longitude": 103.8},
        {"image_url": "ftp://example.com/a.png"},
        {"status": None},
        {"id": str(uuid4())},
    ],
)
def test_invalid_payload_returns_field_error_without_write(setup, change):
    client, token, _subject, _calls, repository = setup
    response = post(client, token, body() | change)
    assert response.status_code == 422
    assert response.json()["error"]["fields"]
    assert repository.payload is None


def test_mismatched_authorization_subject_fails_closed(setup, monkeypatch):
    client, token, _subject, _calls, repository = setup
    monkeypatch.setattr(
        auth.httpx,
        "post",
        lambda *args, **kwargs: SimpleNamespace(
            status_code=200,
            json=lambda: {
                "subjectId": str(uuid4()),
                "accountStatus": "ACTIVE",
                "systemRole": "ADMIN",
                "allowed": True,
            },
        ),
    )
    assert post(client, token, body()).status_code == 503
    assert repository.payload is None
