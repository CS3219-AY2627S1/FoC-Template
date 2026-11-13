"""Integration tests for bearer-session authentication."""

import logging
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.auth import SESSION_REFRESH_INTERVAL, cleanup_sessions, hash_session_token
from app.db import Base, get_db
from app.main import app
from app.models import ADMIN_STATE_LOCK_NAME, AdminStateLock, User, UserSession
from app.schemas import UserCreate
from app.services.users import register_user


@pytest.fixture
def database():
    """Provide an isolated in-memory database for authentication tests."""

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
    """Create a valid active user for an authentication scenario."""

    values = {
        "nus_student_number": "A0123456X",
        "email": "student@example.com",
        "display_name": "Student",
        "password": "Password1!",
    }
    values.update(overrides)
    return register_user(UserCreate(**values), database)


def login(client):
    """Log in the default test user and return the bearer token."""

    response = client.post(
        "/login",
        json={"nus_student_number": "A0123456X", "password": "Password1!"},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def test_protected_profile_requires_a_valid_bearer_session(client, database):
    """A valid session accesses only the identity that created it."""

    user = create_user(database)
    token = login(client)

    response = client.get("/users/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json()["id"] == str(user.id)
    assert "password_hash" not in response.json()
    assert "access_token" not in response.json()


@pytest.mark.parametrize(
    "headers",
    [{}, {"Authorization": "Bearer malformed"}, {"Authorization": "Basic abc"}],
)
def test_protected_profile_rejects_missing_or_malformed_credentials(client, database, headers):
    """Missing, malformed, and unsupported credentials receive one safe error."""

    user = create_user(database)

    response = client.get("/users/me", headers=headers)

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid authentication credentials"}
    assert response.headers["www-authenticate"] == "Bearer"


def test_expired_and_tampered_sessions_are_rejected(client, database):
    """Expired and altered bearer tokens cannot access protected operations."""

    user = create_user(database)
    now = datetime.now(timezone.utc)
    valid_token = "A" * 43
    expired = UserSession(
        user_id=user.id,
        token_hash=hash_session_token(valid_token),
        created_at=now - timedelta(hours=1),
        last_activity_at=now - timedelta(hours=1),
        expires_at=now - timedelta(seconds=1),
        absolute_expires_at=now + timedelta(hours=23),
    )
    database.add(expired)
    database.commit()

    expired_response = client.get(
        "/users/me", headers={"Authorization": f"Bearer {valid_token}"}
    )
    tampered_response = client.get(
        "/users/me", headers={"Authorization": f"Bearer {'B' * 43}"}
    )

    assert expired_response.status_code == 401
    assert tampered_response.status_code == 401


def test_activity_refresh_is_capped_by_absolute_expiry(client, database):
    """Valid activity extends idle expiry but never extends absolute expiry."""

    user = create_user(database)
    token = login(client)
    session = database.scalar(select(UserSession).where(UserSession.user_id == user.id))
    now = datetime.now(timezone.utc)
    session.last_activity_at = now - timedelta(minutes=20)
    session.expires_at = now + timedelta(minutes=1)
    session.absolute_expires_at = now + timedelta(minutes=5)
    database.commit()

    response = client.get("/users/me", headers={"Authorization": f"Bearer {token}"})
    database.refresh(session)
    refreshed_activity = session.last_activity_at.replace(tzinfo=timezone.utc)
    refreshed_expiry = session.expires_at.replace(tzinfo=timezone.utc)
    refreshed_absolute_expiry = session.absolute_expires_at.replace(tzinfo=timezone.utc)

    assert response.status_code == 200
    assert refreshed_activity > now - timedelta(seconds=5)
    assert refreshed_expiry <= refreshed_absolute_expiry
    assert refreshed_expiry > now + timedelta(minutes=4)


def test_recent_activity_does_not_write_a_session_heartbeat(client, database):
    """A valid request within the refresh interval does not update the row."""

    create_user(database)
    token = login(client)
    session = database.scalar(
        select(UserSession).where(UserSession.token_hash == hash_session_token(token))
    )
    original_activity = session.last_activity_at
    original_expiry = session.expires_at

    response = client.get("/users/me", headers={"Authorization": f"Bearer {token}"})

    database.refresh(session)
    assert response.status_code == 200
    assert session.last_activity_at == original_activity
    assert session.expires_at == original_expiry


def test_activity_refreshes_after_the_refresh_interval(client, database):
    """A valid request after the interval persists a new heartbeat."""

    create_user(database)
    token = login(client)
    session = database.scalar(
        select(UserSession).where(UserSession.token_hash == hash_session_token(token))
    )
    now = datetime.now(timezone.utc)
    session.last_activity_at = now - SESSION_REFRESH_INTERVAL - timedelta(seconds=1)
    session.expires_at = now + timedelta(minutes=20)
    database.commit()
    previous_activity = session.last_activity_at

    response = client.get("/users/me", headers={"Authorization": f"Bearer {token}"})

    database.refresh(session)
    assert response.status_code == 200
    assert session.last_activity_at > previous_activity
    refreshed_expiry = session.expires_at.replace(tzinfo=timezone.utc)
    assert refreshed_expiry > now + timedelta(minutes=29)


def test_logout_revokes_the_current_session(client, database, caplog):
    """A logged-out token cannot be reused for protected operations."""

    user = create_user(database)
    token = login(client)
    headers = {"Authorization": f"Bearer {token}"}

    with caplog.at_level(logging.INFO, logger="app.auth"):
        logout_response = client.post("/logout", headers=headers)
    profile_response = client.get("/users/me", headers=headers)
    session = database.scalar(
        select(UserSession).where(UserSession.token_hash == hash_session_token(token))
    )

    assert logout_response.status_code == 204
    assert profile_response.status_code == 401
    assert session.revoked_at is not None
    record = next(
        record
        for record in caplog.records
        if getattr(record, "event", None) == "logout_succeeded"
    )
    assert record.fields == {"user_id": str(user.id)}


def test_cleanup_removes_revoked_and_expired_sessions_but_keeps_active_sessions(database):
    """Session housekeeping removes unusable records without touching live ones."""

    user = create_user(database)
    now = datetime.now(timezone.utc)
    active_token = "A" * 43
    revoked_token = "B" * 43
    expired_token = "C" * 43
    active = UserSession(
        user_id=user.id,
        token_hash=hash_session_token(active_token),
        created_at=now,
        last_activity_at=now,
        expires_at=now + timedelta(minutes=10),
        absolute_expires_at=now + timedelta(hours=1),
    )
    revoked = UserSession(
        user_id=user.id,
        token_hash=hash_session_token(revoked_token),
        created_at=now,
        last_activity_at=now,
        expires_at=now + timedelta(minutes=10),
        absolute_expires_at=now + timedelta(hours=1),
        revoked_at=now,
    )
    expired = UserSession(
        user_id=user.id,
        token_hash=hash_session_token(expired_token),
        created_at=now - timedelta(hours=1),
        last_activity_at=now - timedelta(hours=1),
        expires_at=now - timedelta(seconds=1),
        absolute_expires_at=now + timedelta(hours=1),
    )
    database.add_all([active, revoked, expired])
    database.commit()

    deleted = cleanup_sessions(database, now=now)
    database.commit()

    remaining = database.scalars(select(UserSession)).all()
    assert deleted == 2
    assert [session.token_hash for session in remaining] == [hash_session_token(active_token)]
