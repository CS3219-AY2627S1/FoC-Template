# AI Assistance Disclosure (hwangjihun):
# Tool: ChatGPT (Codex, model: gpt-6-sol), date: 2026-09-24
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-21
# Scope: Generated and refined Supplier regression tests and test fixtures.
# Author review: I validated correctness, and added boundary checks.

"""HTTP checks for authenticated supplier updates."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app import auth
from app.config import Settings, get_settings
from app.errors import ApiError
from app.main import app
from app.repository import get_repository
from app.schemas import SupplierResponse


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

        def update(self, supplier_id, patch):
            self.called_with = (supplier_id, patch)
            if self.missing:
                raise ApiError(404, "SUPPLIER_NOT_FOUND", "Supplier not found")
            return SupplierResponse(
                id=supplier_id,
                name="Updated Cafe",
                categories=["FOOD"],
                building_area="Central Library",
                pickup_location_description="Near the entrance",
                floor=None,
                latitude=None,
                longitude=None,
                opening_time=None,
                closing_time=None,
                image_url=None,
                status="ACTIVE",
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )

    repository = FakeRepository()
    app.dependency_overrides[get_repository] = lambda: repository
    with TestClient(app) as client:
        yield client, token, decision, actions, repository
    app.dependency_overrides.clear()


@pytest.mark.parametrize("role", ["ADMIN", "SUPER_ADMIN"])
def test_admin_roles_can_update(setup, role):
    client, token, decision, actions, repository = setup
    decision["systemRole"] = role
    supplier_id = uuid4()
    response = client.patch(
        f"/api/v1/admin/suppliers/{supplier_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Updated Cafe"},
    )
    assert response.status_code == 200
    assert response.json()["id"] == str(supplier_id)
    assert actions == ["SUPPLIER_UPDATE"]
    assert repository.called_with[0] == supplier_id
    assert repository.called_with[1].model_fields_set == {"name"}


def test_deactivation_uses_current_deactivation_permission(setup):
    client, token, _decision, actions, repository = setup
    response = client.patch(
        f"/api/v1/admin/suppliers/{uuid4()}",
        headers={"Authorization": f"Bearer {token}"},
        json={"status": "INACTIVE"},
    )
    assert response.status_code == 200
    assert actions == ["SUPPLIER_DEACTIVATE"]
    assert repository.called_with is not None


def test_user_and_missing_auth_cannot_reach_repository(setup):
    client, token, decision, _actions, repository = setup
    path = f"/api/v1/admin/suppliers/{uuid4()}"
    assert client.patch(path, json={"name": "Updated Cafe"}).status_code == 401
    assert (
        client.patch(
            path, headers={"Authorization": "Bearer not-a-jwt"}, json={"name": "Updated Cafe"}
        ).status_code
        == 401
    )
    decision.update(systemRole="USER", allowed=False)
    assert (
        client.patch(
            path, headers={"Authorization": f"Bearer {token}"}, json={"name": "Updated Cafe"}
        ).status_code
        == 403
    )
    assert repository.called_with is None


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"id": str(uuid4())},
        {"created_at": "2026-01-01T00:00:00Z"},
        {"latitude": "1.3", "longitude": 103.8},
        {"image_url": "ftp://example.com/image.png"},
    ],
)
def test_empty_or_protected_field_patch_is_rejected(setup, payload):
    client, token, _decision, _actions, repository = setup
    response = client.patch(
        f"/api/v1/admin/suppliers/{uuid4()}",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )
    assert response.status_code == 422
    assert response.json()["error"]["fields"]
    assert repository.called_with is None


def test_missing_supplier_is_reported(setup):
    client, token, _decision, _actions, repository = setup
    repository.missing = True
    response = client.patch(
        f"/api/v1/admin/suppliers/{uuid4()}",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Updated Cafe"},
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "SUPPLIER_NOT_FOUND"
