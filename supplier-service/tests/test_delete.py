# AI Assistance Disclosure (hwangjihun):
# Tool: ChatGPT (Codex, model: gpt-6-sol), date: 2026-09-24
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-21
# Scope: Generated and refined Supplier regression tests and test fixtures.
# Author review: I validated correctness, and added boundary checks.

"""HTTP checks for the interim, deactivation-only DELETE endpoint."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app import auth
from app.config import Settings, get_settings
from app.errors import ApiError
from app.main import app
from app.repository import get_repository
from app.schemas import SupplierRemovalResponse


@pytest.fixture
def setup(monkeypatch):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = uuid4()
    token = jwt.encode(
        {
            "iss": "foc-user-service",
            "aud": "foc-services",
            "exp": datetime.now(UTC) + timedelta(minutes=10),
            "iat": datetime.now(UTC),
            "sub": str(subject),
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

    monkeypatch.setattr(auth, "jwks_client", lambda _url: FakeJwks())
    decision = {
        "subjectId": str(subject),
        "accountStatus": "ACTIVE",
        "systemRole": "ADMIN",
        "allowed": True,
    }
    actions = []

    def authorize(_url, *, headers, json, timeout):
        actions.append(json["action"])
        return SimpleNamespace(status_code=200, json=lambda: decision)

    monkeypatch.setattr(auth.httpx, "post", authorize)
    app.dependency_overrides[get_settings] = lambda: Settings(
        database_url="unused-in-http-test",
        user_service_base_url="http://user-service:8000",
        supplier_service_shared_secret="test-service-secret",
        jwt_issuer="foc-user-service",
        jwt_audience="foc-services",
    )

    class FakeRepository:
        called_with = None
        missing = False

        def deactivate(self, supplier_id):
            self.called_with = supplier_id
            if self.missing:
                raise ApiError(404, "SUPPLIER_NOT_FOUND", "Supplier not found")
            return SupplierRemovalResponse(id=supplier_id, outcome="DEACTIVATED")

    repository = FakeRepository()
    app.dependency_overrides[get_repository] = lambda: repository
    with TestClient(app) as client:
        yield client, token, decision, actions, repository
    app.dependency_overrides.clear()


@pytest.mark.parametrize("role", ["ADMIN", "SUPER_ADMIN"])
def test_admin_delete_reports_deactivation(setup, role):
    client, token, decision, actions, repository = setup
    decision["systemRole"] = role
    supplier_id = uuid4()
    response = client.delete(
        f"/api/v1/admin/suppliers/{supplier_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json() == {"id": str(supplier_id), "outcome": "DEACTIVATED"}
    assert actions == ["SUPPLIER_DEACTIVATE"]
    assert repository.called_with == supplier_id


def test_unauthorized_delete_never_reaches_repository(setup):
    client, token, decision, _actions, repository = setup
    path = f"/api/v1/admin/suppliers/{uuid4()}"
    assert client.delete(path).status_code == 401
    assert client.delete(path, headers={"Authorization": "Bearer invalid"}).status_code == 401
    decision.update(systemRole="USER", allowed=False)
    assert client.delete(path, headers={"Authorization": f"Bearer {token}"}).status_code == 403
    assert repository.called_with is None


def test_unavailable_user_service_does_not_deactivate(setup, monkeypatch):
    client, token, _decision, _actions, repository = setup

    def unavailable(*_args, **_kwargs):
        raise httpx.ConnectError("User Service unavailable")

    monkeypatch.setattr(auth.httpx, "post", unavailable)
    response = client.delete(
        f"/api/v1/admin/suppliers/{uuid4()}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 503
    assert repository.called_with is None


def test_delete_reports_missing_supplier(setup):
    client, token, _decision, _actions, repository = setup
    repository.missing = True
    response = client.delete(
        f"/api/v1/admin/suppliers/{uuid4()}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "SUPPLIER_NOT_FOUND"


def test_delete_rejects_invalid_supplier_id(setup):
    client, token, _decision, _actions, repository = setup
    response = client.delete(
        "/api/v1/admin/suppliers/not-a-uuid",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 422
    assert repository.called_with is None
