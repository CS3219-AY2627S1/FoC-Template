# AI Assistance Disclosure (hwangjihun):
# Tool: ChatGPT (Codex, model: gpt-6-sol), date: 2026-09-24
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-21
# Scope: Generated and refined Supplier regression tests and test fixtures.
# Author review: I validated correctness, and added boundary checks.

"""HTTP contract checks for the administrator supplier list."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.repository import get_repository
from app.schemas import SupplierListResponse


@pytest.mark.parametrize("role", ["ADMIN", "SUPER_ADMIN"])
def test_admin_list_uses_current_role_decision_and_status_filter(read_auth, role):
    token, decision, actions = read_auth
    decision.update(systemRole=role, allowed=True)

    class FakeRepository:
        call = None

        def list_admin_suppliers(self, filters, status):
            self.call = (filters, status)
            return SupplierListResponse(
                items=[], page=filters.page, page_size=filters.page_size, total=0
            )

    repository = FakeRepository()
    app.dependency_overrides[get_repository] = lambda: repository
    with TestClient(app) as client:
        response = client.get(
            "/api/v1/admin/suppliers",
            params=[("status", "INACTIVE"), ("category", "FOOD"), ("q", "cafe")],
            headers={"Authorization": f"Bearer {token}"},
        )
    assert response.status_code == 200
    assert response.json() == {"items": [], "page": 1, "page_size": 20, "total": 0}
    assert repository.call[0].categories == ["FOOD"]
    assert repository.call[1] == "INACTIVE"
    assert actions == ["SUPPLIER_UPDATE"]


def test_admin_list_denies_user_and_invalid_requests(read_auth):
    token, decision, actions = read_auth

    class FakeRepository:
        calls = 0

        def list_admin_suppliers(self, _filters, _status):
            self.calls += 1
            raise AssertionError("Unauthorized requests must not read suppliers")

    repository = FakeRepository()
    app.dependency_overrides[get_repository] = lambda: repository
    with TestClient(app) as client:
        assert client.get("/api/v1/admin/suppliers").status_code == 401
        assert (
            client.get(
                "/api/v1/admin/suppliers", headers={"Authorization": "Bearer invalid"}
            ).status_code
            == 401
        )
        headers = {"Authorization": f"Bearer {token}"}
        assert client.get("/api/v1/admin/suppliers", headers=headers).status_code == 403
        decision.update(systemRole="ADMIN", allowed=True)
        assert (
            client.get(
                "/api/v1/admin/suppliers", params={"status": "DISABLED"}, headers=headers
            ).status_code
            == 422
        )
    assert repository.calls == 0
    assert actions == ["SUPPLIER_UPDATE", "SUPPLIER_UPDATE"]


def test_admin_list_rejects_removed_area_filter(read_auth):
    token, decision, _actions = read_auth
    decision.update(systemRole="ADMIN", allowed=True)

    class FakeRepository:
        def list_admin_suppliers(self, _filters, _status):
            raise AssertionError("An unsupported filter must not read suppliers")

    app.dependency_overrides[get_repository] = lambda: FakeRepository()
    with TestClient(app) as client:
        response = client.get(
            "/api/v1/admin/suppliers",
            params={"building_area": "Central Library"},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert response.status_code == 422
    assert response.json()["error"]["fields"] == [
        {"field": "building_area", "message": "Building/area filtering is not supported"}
    ]
