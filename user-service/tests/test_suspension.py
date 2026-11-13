"""Integration tests for administrator account suspension."""

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

import pytest

from app.auth import hash_session_token
from app.db import Base, get_db
from app.main import app
from app.models import ADMIN_STATE_LOCK_NAME, AdminStateLock, User, UserSession
from app.schemas import UserCreate
from app.services.users import register_user


@pytest.fixture
def database():
    """Provide an isolated in-memory database for suspension tests."""

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
def client(database):
    """Use the isolated database for HTTP requests."""

    def override_database():
        yield database

    app.dependency_overrides[get_db] = override_database
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def create_user(database, **overrides) -> User:
    """Create a valid account for a suspension scenario."""

    values = {
        "nus_student_number": "A0123456X",
        "email": "student@example.com",
        "display_name": "Student",
        "password": "Password1!",
    }
    values.update(overrides)
    return register_user(UserCreate(**values), database)


def login(client, student_number: str) -> str:
    """Log in and return the bearer token."""

    response = client.post(
        "/login",
        json={"nus_student_number": student_number, "password": "Password1!"},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def test_active_admin_can_suspend_user_and_revoke_all_access(client, database):
    """Suspension changes status and immediately invalidates every target session."""

    admin = create_user(database)
    admin.role = "admin"
    target = create_user(
        database,
        nus_student_number="A0123457X",
        email="target@example.com",
        display_name="Target Student",
    )
    database.commit()

    admin_token = login(client, admin.nus_student_number)
    target_token = login(client, target.nus_student_number)
    response = client.post(
        f"/admin/users/{target.id}/suspend",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "suspended"
    database.refresh(target)
    assert target.status == "suspended"

    session = database.scalar(
        select(UserSession).where(UserSession.token_hash == hash_session_token(target_token))
    )
    assert session.revoked_at is not None
    assert client.get(
        "/users/me", headers={"Authorization": f"Bearer {target_token}"}
    ).status_code == 401
    assert client.post(
        "/login",
        json={
            "nus_student_number": target.nus_student_number,
            "password": "Password1!",
        },
    ).status_code == 401


def test_regular_user_cannot_suspend_an_account(client, database):
    """The service rejects suspension attempts from non-administrators."""

    regular = create_user(database)
    target = create_user(
        database,
        nus_student_number="A0123457X",
        email="target@example.com",
        display_name="Target Student",
    )
    database.commit()

    response = client.post(
        f"/admin/users/{target.id}/suspend",
        headers={"Authorization": f"Bearer {login(client, regular.nus_student_number)}"},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "Admin privileges required"}
    database.refresh(target)
    assert target.status == "active"


def test_suspension_rechecks_role_after_login(client, database):
    """A session issued while admin cannot retain admin access after role removal."""

    admin = create_user(database)
    target = create_user(
        database,
        nus_student_number="A0123457X",
        email="target@example.com",
        display_name="Target Student",
    )
    admin.role = "admin"
    database.commit()

    admin_token = login(client, admin.nus_student_number)
    admin.role = "user"
    database.commit()

    response = client.post(
        f"/admin/users/{target.id}/suspend",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 403
    database.refresh(target)
    assert target.status == "active"


def test_admin_cannot_suspend_another_admin(client, database):
    """An administrator cannot suspend a different administrator account."""

    admin = create_user(database)
    admin.role = "admin"
    target = create_user(
        database,
        nus_student_number="A0123457X",
        email="target@example.com",
        display_name="Target Admin",
    )
    target.role = "admin"
    database.commit()

    admin_token = login(client, admin.nus_student_number)
    target_token = login(client, target.nus_student_number)
    response = client.post(
        f"/admin/users/{target.id}/suspend",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 403
    assert response.json() == {
        "detail": "Administrators cannot suspend another administrator"
    }
    database.refresh(target)
    assert target.status == "active"
    assert client.get(
        "/users/me", headers={"Authorization": f"Bearer {target_token}"}
    ).status_code == 200


def test_admin_cannot_suspend_own_account(client, database):
    """An administrator cannot remove their own active access."""

    admin = create_user(database)
    admin.role = "admin"
    database.commit()
    admin_token = login(client, admin.nus_student_number)

    response = client.post(
        f"/admin/users/{admin.id}/suspend",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 403
    assert response.json() == {
        "detail": "Administrators cannot suspend their own account"
    }
    database.refresh(admin)
    assert admin.status == "active"
    assert client.get(
        "/users/me", headers={"Authorization": f"Bearer {admin_token}"}
    ).status_code == 200


def test_admin_can_unsuspend_user_and_revoke_stale_sessions(client, database):
    """Unsuspension restores access but requires a fresh login."""

    admin = create_user(database)
    admin.role = "admin"
    target = create_user(
        database,
        nus_student_number="A0123457X",
        email="target@example.com",
        display_name="Target Student",
    )
    database.commit()

    target_token = login(client, target.nus_student_number)
    target.status = "suspended"
    database.commit()
    admin_token = login(client, admin.nus_student_number)

    response = client.post(
        f"/admin/users/{target.id}/unsuspend",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "active"
    database.refresh(target)
    assert target.status == "active"
    session = database.scalar(
        select(UserSession).where(UserSession.token_hash == hash_session_token(target_token))
    )
    assert session.revoked_at is not None
    assert client.get(
        "/users/me", headers={"Authorization": f"Bearer {target_token}"}
    ).status_code == 401
    assert client.post(
        "/login",
        json={
            "nus_student_number": target.nus_student_number,
            "password": "Password1!",
        },
    ).status_code == 200


def test_admin_can_unsuspend_another_suspended_admin(client, database):
    """Restoring a suspended admin preserves the administrator role."""

    admin = create_user(database)
    admin.role = "admin"
    target = create_user(
        database,
        nus_student_number="A0123457X",
        email="target@example.com",
        display_name="Target Admin",
    )
    target.role = "admin"
    target.status = "suspended"
    database.commit()
    admin_token = login(client, admin.nus_student_number)

    response = client.post(
        f"/admin/users/{target.id}/unsuspend",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "active"
    assert response.json()["role"] == "admin"
    database.refresh(target)
    assert target.status == "active"
    assert target.role == "admin"


def test_admin_cannot_unsuspend_own_account(client, database):
    """An administrator cannot target their own account for unsuspension."""

    admin = create_user(database)
    admin.role = "admin"
    database.commit()
    admin_token = login(client, admin.nus_student_number)

    response = client.post(
        f"/admin/users/{admin.id}/unsuspend",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 403
    assert response.json() == {
        "detail": "Administrators cannot unsuspend their own account"
    }
    database.refresh(admin)
    assert admin.status == "active"
    assert admin.role == "admin"


def test_unsuspend_requires_a_suspended_target(client, database):
    """Unsuspension rejects an account that is not suspended."""

    admin = create_user(database)
    admin.role = "admin"
    target = create_user(
        database,
        nus_student_number="A0123457X",
        email="target@example.com",
        display_name="Target Student",
    )
    database.commit()
    admin_token = login(client, admin.nus_student_number)

    response = client.post(
        f"/admin/users/{target.id}/unsuspend",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "User is not suspended"}


def test_admin_can_revoke_another_admin_rights(client, database):
    """Revoking rights demotes the target without invalidating their session."""

    admin = create_user(database)
    admin.role = "admin"
    target = create_user(
        database,
        nus_student_number="A0123457X",
        email="target@example.com",
        display_name="Target Admin",
    )
    target.role = "admin"
    database.commit()

    admin_token = login(client, admin.nus_student_number)
    target_token = login(client, target.nus_student_number)
    response = client.post(
        f"/admin/users/{target.id}/revoke-admin",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    assert response.json()["role"] == "user"
    database.refresh(target)
    assert target.role == "user"
    assert client.get(
        "/users/me", headers={"Authorization": f"Bearer {target_token}"}
    ).json()["role"] == "user"


def test_admin_can_grant_admin_rights_to_another_active_user(client, database):
    """Granting rights promotes the target and preserves its session."""

    admin = create_user(database)
    admin.role = "admin"
    target = create_user(
        database,
        nus_student_number="A0123457X",
        email="target@example.com",
        display_name="Target Student",
    )
    database.commit()

    admin_token = login(client, admin.nus_student_number)
    target_token = login(client, target.nus_student_number)
    response = client.post(
        f"/admin/users/{target.id}/grant-admin",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    assert response.json()["role"] == "admin"
    database.refresh(target)
    assert target.role == "admin"
    assert client.get(
        "/users/me", headers={"Authorization": f"Bearer {target_token}"}
    ).json()["role"] == "admin"


def test_regular_user_cannot_grant_admin_rights(client, database):
    """Only an active administrator may promote another user."""

    actor = create_user(database)
    target = create_user(
        database,
        nus_student_number="A0123457X",
        email="target@example.com",
        display_name="Target Student",
    )
    database.commit()

    response = client.post(
        f"/admin/users/{target.id}/grant-admin",
        headers={"Authorization": f"Bearer {login(client, actor.nus_student_number)}"},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "Admin privileges required"}
    database.refresh(target)
    assert target.role == "user"


def test_admin_cannot_grant_admin_rights_to_self(client, database):
    """Self-promotion is rejected even for an existing administrator."""

    admin = create_user(database)
    admin.role = "admin"
    database.commit()

    response = client.post(
        f"/admin/users/{admin.id}/grant-admin",
        headers={"Authorization": f"Bearer {login(client, admin.nus_student_number)}"},
    )

    assert response.status_code == 403
    assert response.json() == {
        "detail": "Administrators cannot grant themselves administrator rights"
    }


def test_grant_admin_requires_an_active_non_admin_target(client, database):
    """Promotion rejects missing, already-admin, and inactive targets."""

    admin = create_user(database)
    admin.role = "admin"
    already_admin = create_user(
        database,
        nus_student_number="A0123457X",
        email="already-admin@example.com",
        display_name="Already Admin",
    )
    already_admin.role = "admin"
    inactive = create_user(
        database,
        nus_student_number="A0123458X",
        email="inactive@example.com",
        display_name="Inactive Student",
    )
    inactive.status = "suspended"
    database.commit()
    admin_token = login(client, admin.nus_student_number)
    headers = {"Authorization": f"Bearer {admin_token}"}

    already_response = client.post(
        f"/admin/users/{already_admin.id}/grant-admin", headers=headers
    )
    inactive_response = client.post(
        f"/admin/users/{inactive.id}/grant-admin", headers=headers
    )
    missing_response = client.post(
        "/admin/users/00000000-0000-0000-0000-000000000000/grant-admin",
        headers=headers,
    )

    assert already_response.status_code == 409
    assert already_response.json() == {"detail": "User is already an administrator"}
    assert inactive_response.status_code == 409
    assert inactive_response.json() == {
        "detail": "Only active users can be made administrators"
    }
    assert missing_response.status_code == 404
    assert missing_response.json() == {"detail": "User not found"}


def test_admin_cannot_revoke_own_admin_rights(client, database):
    """Self-revocation is rejected so the caller remains an administrator."""

    admin = create_user(database)
    admin.role = "admin"
    database.commit()

    response = client.post(
        f"/admin/users/{admin.id}/revoke-admin",
        headers={"Authorization": f"Bearer {login(client, admin.nus_student_number)}"},
    )

    assert response.status_code == 403
    assert response.json() == {
        "detail": "Administrators cannot revoke their own administrator rights"
    }
    database.refresh(admin)
    assert admin.role == "admin"


def test_revoke_admin_requires_an_admin_target(client, database):
    """Revocation rejects a target that is already a regular user."""

    admin = create_user(database)
    admin.role = "admin"
    target = create_user(
        database,
        nus_student_number="A0123457X",
        email="target@example.com",
        display_name="Target Student",
    )
    database.commit()

    response = client.post(
        f"/admin/users/{target.id}/revoke-admin",
        headers={"Authorization": f"Bearer {login(client, admin.nus_student_number)}"},
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "User is not an administrator"}
    database.refresh(target)
    assert target.role == "user"


def test_suspending_unknown_user_returns_not_found(client, database):
    """An authorized administrator receives a safe not-found response."""

    admin = create_user(database)
    admin.role = "admin"
    database.commit()

    response = client.post(
        "/admin/users/00000000-0000-0000-0000-000000000000/suspend",
        headers={"Authorization": f"Bearer {login(client, admin.nus_student_number)}"},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "User not found"}
