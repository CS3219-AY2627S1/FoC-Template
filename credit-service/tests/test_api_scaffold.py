from pathlib import Path
from uuid import uuid4

import certifi
from fastapi.testclient import TestClient

from app.auth import get_current_identity
from app.clients import Identity
from app.config import Settings
from app.db import Base
from app.main import create_app


def settings(database_url: str = "sqlite+pysqlite:///:memory:") -> Settings:
    return Settings(
        database_url=database_url,
        user_service_url="https://user-service.test",
        user_service_ca_file=certifi.where(),
        initial_credit_allocation=100,
    )


def app_with_identity(role: str, database_url: str = "sqlite+pysqlite:///:memory:"):
    app = create_app(settings(database_url))
    identity = Identity(id=uuid4(), role=role, status="active")
    app.dependency_overrides[get_current_identity] = lambda: identity
    return app


def test_health_does_not_depend_on_database_readiness() -> None:
    with TestClient(create_app(settings())) as client:
        assert client.get("/health").json() == {"status": "healthy"}


def test_account_recovery_rejects_non_admin_user() -> None:
    user_id = uuid4()
    with TestClient(app_with_identity("user")) as client:
        response = client.put(
            f"/admin/credit-accounts/{user_id}",
            json={"user_id": str(user_id)},
        )
    assert response.status_code == 403


def test_admin_can_use_idempotent_account_recovery(tmp_path: Path) -> None:
    user_id = uuid4()
    database_url = f"sqlite+pysqlite:///{tmp_path / 'credit-api.db'}"
    app = app_with_identity("admin", database_url)
    with TestClient(app) as client:
        Base.metadata.create_all(app.state.engine)
        response = client.put(
            f"/admin/credit-accounts/{user_id}",
        )
        replay = client.put(
            f"/admin/credit-accounts/{user_id}",
            json={"user_id": str(user_id)},
        )
    assert response.status_code == 201
    assert response.json()["available_balance"] == 100
    assert "status" not in response.json()
    assert replay.status_code == 201
    assert replay.json()["available_balance"] == 100
    assert "status" not in replay.json()
