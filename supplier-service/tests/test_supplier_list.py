# AI Assistance Disclosure (hwangjihun):
# Tool: ChatGPT (Codex, model: gpt-6-sol), date: 2026-09-24
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-21
# Scope: Generated and refined Supplier regression tests and test fixtures.
# Author review: I validated correctness, and added boundary checks.

"""HTTP contract checks for the normal active-only supplier list."""

from fastapi.testclient import TestClient

from app.main import app
from app.repository import get_repository
from app.schemas import SupplierListResponse


def test_normal_list_parses_search_filters_and_paging(read_auth):
    token, _decision, actions = read_auth

    class FakeRepository:
        filters = None

        def list_active_suppliers(self, filters):
            self.filters = filters
            return SupplierListResponse(
                items=[], page=filters.page, page_size=filters.page_size, total=0
            )

    repository = FakeRepository()
    app.dependency_overrides[get_repository] = lambda: repository
    with TestClient(app) as client:
        response = client.get(
            "/api/v1/suppliers",
            params=[
                ("q", " cafe "),
                ("category", "FOOD"),
                ("category", "COFFEE"),
                ("sort", "desc"),
                ("page", "2"),
                ("page_size", "5"),
            ],
            headers={"Authorization": f"Bearer {token}"},
        )
    assert response.status_code == 200
    assert response.json() == {"items": [], "page": 2, "page_size": 5, "total": 0}
    assert repository.filters.categories == ["FOOD", "COFFEE"]
    assert repository.filters.q == " cafe "
    assert (repository.filters.sort, repository.filters.page, repository.filters.page_size) == (
        "desc",
        2,
        5,
    )
    assert actions == []


def test_normal_list_rejects_missing_token_status_override_and_invalid_query(read_auth):
    token, _decision, _actions = read_auth

    class FakeRepository:
        calls = 0

        def list_active_suppliers(self, _filters):
            self.calls += 1
            raise AssertionError("Rejected requests must not read suppliers")

    repository = FakeRepository()
    app.dependency_overrides[get_repository] = lambda: repository
    with TestClient(app) as client:
        assert client.get("/api/v1/suppliers").status_code == 401
        assert (
            client.get("/api/v1/suppliers", headers={"Authorization": "Bearer invalid"}).status_code
            == 401
        )
        headers = {"Authorization": f"Bearer {token}"}
        for params in (
            {"status": "INACTIVE"},
            {"building_area": "Central Library"},
            {"page": "0"},
            {"page_size": "101"},
            {"sort": "sideways"},
        ):
            response = client.get("/api/v1/suppliers", params=params, headers=headers)
            assert response.status_code == 422
    assert repository.calls == 0
