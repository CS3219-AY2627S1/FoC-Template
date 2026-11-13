"""Tests for trusted service-to-service authorization checks."""

import pytest
from uuid import uuid4

from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models import ADMIN_STATE_LOCK_NAME, AdminStateLock, User
from app.schemas import UserCreate
from app.service_auth import require_internal_service
from app.services.users import register_user


INTERNAL_TOKEN = "test-internal-service-token"


@pytest.fixture
def database():
    """Provide an isolated database for authorization-check tests."""

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    with Session(engine) as db:
        db.add(AdminStateLock(lock_name=ADMIN_STATE_LOCK_NAME))
        db.commit()
        yield db
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture
def client(database, monkeypatch):
    """Use the isolated database and internal-service secret."""

    monkeypatch.setenv("USER_SERVICE_INTERNAL_TOKEN", INTERNAL_TOKEN)

    def override_database():
        yield database

    app.dependency_overrides[get_db] = override_database
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def create_user(database, **overrides) -> User:
    """Create a valid account for an authorization-check scenario."""

    values = {
        "nus_student_number": "A0123456X",
        "email": "student@example.com",
        "display_name": "Student",
        "password": "Password1!",
    }
    values.update(overrides)
    return register_user(UserCreate(**values), database)


def login(client) -> str:
    """Log in the default authorization-test user and return its bearer token."""

    response = client.post(
        "/login",
        json={"nus_student_number": "A0123456X", "password": "Password1!"},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def test_internal_identity_returns_only_the_verified_active_identity(client, database):
    """Trusted services receive identity fields without profile data."""

    user = create_user(database)
    token = login(client)

    response = client.get(
        "/internal/auth/identity",
        headers={
            "Authorization": f"Bearer {token}",
            "X-Internal-Service-Token": INTERNAL_TOKEN,
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "id": str(user.id),
        "role": "user",
        "status": "active",
    }


@pytest.mark.parametrize(
    "headers",
    [
        {"Authorization": "Bearer malformed", "X-Internal-Service-Token": INTERNAL_TOKEN},
        {"X-Internal-Service-Token": INTERNAL_TOKEN},
        {"Authorization": "Bearer malformed"},
        {},
    ],
)
def test_internal_identity_requires_both_service_and_user_credentials(
    client, database, headers
):
    """Neither a service secret nor a user bearer token is sufficient alone."""

    create_user(database)

    response = client.get("/internal/auth/identity", headers=headers)

    assert response.status_code == 401


def test_internal_identity_rejects_a_user_that_is_no_longer_active(client, database):
    """A trusted caller cannot use the endpoint to bypass account suspension."""

    user = create_user(database)
    token = login(client)
    user.status = "suspended"
    database.commit()

    response = client.get(
        "/internal/auth/identity",
        headers={
            "Authorization": f"Bearer {token}",
            "X-Internal-Service-Token": INTERNAL_TOKEN,
        },
    )

    assert response.status_code == 401


def test_internal_check_returns_true_only_for_an_active_admin(client, database):
    """Trusted services can check an active admin without receiving a profile."""

    user = create_user(database)
    user.role = "admin"
    database.commit()

    response = client.get(
        f"/internal/users/{user.id}/admin",
        headers={"X-Internal-Service-Token": INTERNAL_TOKEN},
    )

    assert response.status_code == 200
    assert response.json() == {"is_admin": True}


@pytest.mark.parametrize("status", ["deactivated", "suspended"])
def test_internal_check_rejects_inactive_admin(client, database, status):
    """Deactivated and suspended admins cannot authorize other services."""

    user = create_user(database)
    user.role = "admin"
    user.status = status
    database.commit()

    response = client.get(
        f"/internal/users/{user.id}/admin",
        headers={"X-Internal-Service-Token": INTERNAL_TOKEN},
    )

    assert response.status_code == 200
    assert response.json() == {"is_admin": False}


def test_internal_check_returns_false_for_regular_or_unknown_users(client, database):
    """The minimal boolean response does not disclose account existence."""

    user = create_user(database)
    headers = {"X-Internal-Service-Token": INTERNAL_TOKEN}

    regular_response = client.get(f"/internal/users/{user.id}/admin", headers=headers)
    unknown_response = client.get(f"/internal/users/{uuid4()}/admin", headers=headers)

    assert regular_response.status_code == 200
    assert regular_response.json() == {"is_admin": False}
    assert unknown_response.status_code == 200
    assert unknown_response.json() == {"is_admin": False}


@pytest.mark.parametrize("account_status", ["active", "deactivated", "suspended"])
def test_internal_status_check_returns_persisted_account_status(
    client, database, account_status
):
    """Trusted services receive the exact persisted lifecycle status."""

    user = create_user(database)
    user.status = account_status
    database.commit()

    response = client.get(
        f"/internal/users/{user.id}/status",
        headers={"X-Internal-Service-Token": INTERNAL_TOKEN},
    )

    assert response.status_code == 200
    assert response.json() == {"status": account_status}


def test_internal_status_check_returns_unknown_without_disclosing_existence(
    client, database
):
    """Missing users receive the same successful response shape as status checks."""

    response = client.get(
        f"/internal/users/{uuid4()}/status",
        headers={"X-Internal-Service-Token": INTERNAL_TOKEN},
    )

    assert response.status_code == 200
    assert response.json() == {"status": "unknown"}


@pytest.mark.parametrize(
    "headers",
    [{}, {"X-Internal-Service-Token": "wrong-token"}],
)
def test_internal_check_requires_the_service_token(client, database, headers):
    """User bearer sessions and unauthenticated requests cannot use the endpoint."""

    user = create_user(database)
    response = client.get(f"/internal/users/{user.id}/admin", headers=headers)

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid internal service credentials"


@pytest.mark.parametrize(
    "headers",
    [{}, {"X-Internal-Service-Token": "wrong-token"}],
)
def test_internal_status_check_requires_the_service_token(client, database, headers):
    """Status checks are restricted to trusted internal callers."""

    user = create_user(database)
    response = client.get(f"/internal/users/{user.id}/status", headers=headers)

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid internal service credentials"


def test_internal_check_rejects_non_ascii_service_token_without_server_error(
    monkeypatch,
):
    """Malformed Unicode credentials receive 401 instead of raising TypeError."""

    monkeypatch.setenv("USER_SERVICE_INTERNAL_TOKEN", INTERNAL_TOKEN)

    with pytest.raises(HTTPException) as error:
        require_internal_service("é")

    assert error.value.status_code == 401
    assert error.value.detail == "Invalid internal service credentials"
