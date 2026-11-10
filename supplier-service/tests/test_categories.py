# AI Assistance Disclosure (hwangjihun):
# Tool: ChatGPT (Codex, model: gpt-6-sol), date: 2026-09-24
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-21
# Scope: Generated and refined Supplier regression tests and test fixtures.
# Author review: I validated correctness, and added boundary checks.

"""Authentication and database checks for the category lookup endpoint."""

import os
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from urllib.parse import urlparse
from uuid import uuid4

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app import auth
from app.config import Settings, get_settings
from app.errors import ApiError
from app.main import app
from app.repository import SupplierRepository, get_repository
from app.schemas import CategoryResponse


@pytest.fixture
def setup(monkeypatch):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    token = jwt.encode(
        {
            "iss": "foc-user-service",
            "aud": "foc-services",
            "exp": datetime.now(UTC) + timedelta(minutes=10),
            "iat": datetime.now(UTC),
            "sub": str(uuid4()),
            "sid": str(uuid4()),
            "roleVersion": 1,
        },
        key,
        algorithm="RS256",
        headers={"kid": "test-key"},
    )

    class FakeJwks:
        def get_signing_key_from_jwt(self, _token):
            return SimpleNamespace(key=key.public_key())

    def no_management_decision(*_args, **_kwargs):
        raise AssertionError(
            "Ordinary category reads must not call the management decision endpoint"
        )

    monkeypatch.setattr(auth, "jwks_client", lambda _url: FakeJwks())
    monkeypatch.setattr(auth.httpx, "post", no_management_decision)
    app.dependency_overrides[get_settings] = lambda: Settings(
        database_url="unused-in-http-test",
        user_service_base_url="http://user-service:8000",
        supplier_service_shared_secret="",
        jwt_issuer="foc-user-service",
        jwt_audience="foc-services",
    )

    class FakeRepository:
        calls = 0
        unavailable = False

        def list_categories(self):
            self.calls += 1
            if self.unavailable:
                raise ApiError(503, "DATABASE_UNAVAILABLE", "Supplier database is unavailable")
            return [CategoryResponse(code="COFFEE", display_name="Coffee")]

    repository = FakeRepository()
    app.dependency_overrides[get_repository] = lambda: repository
    with TestClient(app) as client:
        yield client, token, repository
    app.dependency_overrides.clear()


def test_authenticated_user_can_read_categories(setup):
    client, token, repository = setup
    response = client.get("/api/v1/categories", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json() == [{"code": "COFFEE", "display_name": "Coffee"}]
    assert repository.calls == 1


def test_missing_or_invalid_token_cannot_read_categories(setup):
    client, _token, repository = setup
    assert client.get("/api/v1/categories").status_code == 401
    assert (
        client.get("/api/v1/categories", headers={"Authorization": "Bearer invalid"}).status_code
        == 401
    )
    assert repository.calls == 0


def test_database_failure_returns_sanitized_error(setup):
    client, token, repository = setup
    repository.unavailable = True
    response = client.get("/api/v1/categories", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "DATABASE_UNAVAILABLE"


def test_local_categories_match_lookup_table():
    url = os.getenv("SUPPLIER_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set SUPPLIER_TEST_DATABASE_URL to the local Supplier Supabase database")
    parsed = urlparse(url)
    if parsed.hostname not in ("localhost", "127.0.0.1") or parsed.port != 55322:
        pytest.fail(
            "Database read tests may run only against local Supplier Supabase on port 55322"
        )
    categories = SupplierRepository(url).list_categories()
    assert {item.code: item.display_name for item in categories} == {
        "FOOD": "Food",
        "COFFEE": "Coffee",
        "SHOPPING": "Shopping",
        "PRINTING": "Printing",
        "LANDMARK": "Landmark",
        "OTHERS": "Others",
    }
    assert [item.display_name for item in categories] == sorted(
        item.display_name for item in categories
    )
