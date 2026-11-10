# AI Assistance Disclosure (hwangjihun):
# Tool: ChatGPT (Codex, model: gpt-6-sol), date: 2026-09-24
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-21
# Scope: Generated and refined Supplier regression tests and test fixtures.
# Author review: I validated correctness, and added boundary checks.

"""HTTP contract checks for active supplier detail."""

from datetime import UTC, datetime
from uuid import uuid4

from fastapi.testclient import TestClient

from app.errors import ApiError
from app.main import app
from app.repository import get_repository
from app.schemas import SupplierResponse


def test_authenticated_user_gets_full_active_detail(read_auth):
    token, _decision, actions = read_auth
    supplier_id = uuid4()

    class FakeRepository:
        called_with = None

        def get_active_supplier(self, requested_id):
            self.called_with = requested_id
            return SupplierResponse(
                id=requested_id,
                name="Example Cafe",
                categories=["COFFEE", "FOOD"],
                building_area="Central Library",
                pickup_location_description="Main entrance",
                floor="1",
                latitude=1.3,
                longitude=103.8,
                opening_time="09:00",
                closing_time="18:00",
                image_url="https://example.com/a.png",
                status="ACTIVE",
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )

    repository = FakeRepository()
    app.dependency_overrides[get_repository] = lambda: repository
    with TestClient(app) as client:
        response = client.get(
            f"/api/v1/suppliers/{supplier_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert response.status_code == 200
    assert response.json()["id"] == str(supplier_id)
    assert response.json()["pickup_location_description"] == "Main entrance"
    assert response.json()["categories"] == ["COFFEE", "FOOD"]
    assert repository.called_with == supplier_id
    assert actions == []


def test_detail_rejects_missing_auth_invalid_id_and_missing_supplier(read_auth):
    token, _decision, _actions = read_auth

    class FakeRepository:
        calls = 0

        def get_active_supplier(self, _supplier_id):
            self.calls += 1
            raise ApiError(404, "SUPPLIER_NOT_FOUND", "Supplier not found")

    repository = FakeRepository()
    app.dependency_overrides[get_repository] = lambda: repository
    path = f"/api/v1/suppliers/{uuid4()}"
    with TestClient(app) as client:
        assert client.get(path).status_code == 401
        assert client.get(path, headers={"Authorization": "Bearer invalid"}).status_code == 401
        assert repository.calls == 0
        headers = {"Authorization": f"Bearer {token}"}
        assert client.get("/api/v1/suppliers/not-a-uuid", headers=headers).status_code == 422
        response = client.get(path, headers=headers)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "SUPPLIER_NOT_FOUND"
    assert repository.calls == 1


def test_detail_database_failure_returns_503(read_auth):
    token, _decision, _actions = read_auth

    class FakeRepository:
        def get_active_supplier(self, _supplier_id):
            raise ApiError(503, "DATABASE_UNAVAILABLE", "Supplier database is unavailable")

    app.dependency_overrides[get_repository] = lambda: FakeRepository()
    with TestClient(app) as client:
        response = client.get(
            f"/api/v1/suppliers/{uuid4()}",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "DATABASE_UNAVAILABLE"
