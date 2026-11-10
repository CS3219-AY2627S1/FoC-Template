# AI Assistance Disclosure (hwangjihun):
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-21
# Scope: Generated and refined Supplier regression tests and test fixtures.
# Author review: I validated correctness, and added boundary checks.

"""Supplier management fails closed for unsupported account states."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.repository import get_repository


@pytest.mark.parametrize(
    ("status", "expected_status"),
    [("DELETED", 403), ("SUSPENDED", 503), ("UNKNOWN", 503)],
)
def test_admin_management_rejects_deleted_and_unsupported_statuses(
    read_auth,
    status,
    expected_status,
):
    token, decision, _actions = read_auth
    # Even an inconsistent allow response must never grant these states access.
    decision.update(systemRole="SUPER_ADMIN", allowed=True, accountStatus=status)

    class UnreachableRepository:
        def list_admin_suppliers(self, _filters, _status):
            raise AssertionError("Rejected account states must not read suppliers")

    app.dependency_overrides[get_repository] = lambda: UnreachableRepository()
    with TestClient(app) as client:
        response = client.get(
            "/api/v1/admin/suppliers",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert response.status_code == expected_status
    assert response.json()["error"]["code"] == (
        "FORBIDDEN" if status == "DELETED" else "AUTH_UNAVAILABLE"
    )
