# AI Assistance Disclosure (hwangjihun):
# Tool: ChatGPT (Codex, model: gpt-6-sol), date: 2026-09-24
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-21
# Scope: Generated and refined Supplier regression tests and test fixtures.
# Author review: I validated correctness, and added boundary checks.

"""HTTP contract checks for administrator supplier detail."""

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.errors import ApiError
from app.main import app
from app.repository import get_repository
from app.schemas import SupplierResponse


@pytest.mark.parametrize("role", ["ADMIN", "SUPER_ADMIN"])
def test_admin_can_get_inactive_supplier_detail(read_auth, role):
    token, decision, actions = read_auth
    decision.update(systemRole=role, allowed=True)
    supplier_id = uuid4()

    class FakeRepository:
        called_with = None

        def get_admin_supplier(self, requested_id):
            self.called_with = requested_id
            return SupplierResponse(
                id=requested_id,
                name="Closed Cafe",
                categories=["COFFEE", "FOOD"],
                building_area="Central Library",
                pickup_location_description="Main entrance",
                floor="1",
                latitude=1.3,
                longitude=103.8,
                opening_time="09:00",
                closing_time="18:00",
                image_url="https://example.com/a.png",
                status="INACTIVE",
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )

    repository = FakeRepository()
    app.dependency_overrides[get_repository] = lambda: repository
    with TestClient(app) as client:
        response = client.get(
            f"/api/v1/admin/suppliers/{supplier_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert response.status_code == 200
    assert response.json()["id"] == str(supplier_id)
    assert response.json()["status"] == "INACTIVE"
    assert response.json()["pickup_location_description"] == "Main entrance"
    assert response.json()["categories"] == ["COFFEE", "FOOD"]
    assert repository.called_with == supplier_id
    assert actions == ["SUPPLIER_UPDATE"]


def test_admin_detail_denies_user_and_reports_missing_supplier(read_auth):
    token, decision, actions = read_auth

    class FakeRepository:
        calls = 0

        def get_admin_supplier(self, _supplier_id):
            self.calls += 1
            raise ApiError(404, "SUPPLIER_NOT_FOUND", "Supplier not found")

    repository = FakeRepository()
    app.dependency_overrides[get_repository] = lambda: repository
    path = f"/api/v1/admin/suppliers/{uuid4()}"
    with TestClient(app) as client:
        assert client.get(path).status_code == 401
        assert client.get(path, headers={"Authorization": "Bearer invalid"}).status_code == 401
        headers = {"Authorization": f"Bearer {token}"}
        assert client.get(path, headers=headers).status_code == 403
        assert repository.calls == 0

        decision.update(systemRole="ADMIN", allowed=True)
        assert client.get("/api/v1/admin/suppliers/not-a-uuid", headers=headers).status_code == 422
        response = client.get(path, headers=headers)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "SUPPLIER_NOT_FOUND"
    assert repository.calls == 1
    assert actions == ["SUPPLIER_UPDATE", "SUPPLIER_UPDATE", "SUPPLIER_UPDATE"]
