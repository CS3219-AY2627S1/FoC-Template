"""Tests for the one-time first-administrator bootstrap."""

from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.models import ADMIN_STATE_LOCK_NAME, AdminStateLock, User
from app.schemas import UserCreate
from app.services.bootstrap import BootstrapError, bootstrap_admin
from app.services.users import verify_password


@pytest.fixture
def database():
    """Provide an isolated database containing the migrated lock row."""

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


def payload(**overrides) -> UserCreate:
    """Build a valid bootstrap payload."""

    values = {
        "nus_student_number": "A0123456X",
        "email": "admin@example.com",
        "display_name": "Platform Admin",
        "password": "Password1!",
    }
    values.update(overrides)
    return UserCreate(**values)


def test_bootstrap_creates_an_active_admin_and_records_completion(database):
    """The first successful run creates an admin and its durable marker."""

    assert bootstrap_admin(payload(), database) is True

    user = database.scalar(select(User))
    lock = database.get(AdminStateLock, ADMIN_STATE_LOCK_NAME)
    assert user is not None
    assert user.role == "admin"
    assert user.status == "active"
    assert verify_password("Password1!", user.password_hash)
    assert lock is not None
    assert lock.bootstrap_completed_at is not None


def test_bootstrap_is_idempotent_after_completion(database):
    """Retries do not change the original account or create another admin."""

    assert bootstrap_admin(payload(), database) is True
    original = database.scalar(select(User))
    original_created_at = original.created_at
    original_password_hash = original.password_hash

    assert (
        bootstrap_admin(
            payload(
                nus_student_number="A0765432Z",
                email="different-admin@example.com",
                display_name="Different Admin",
                password="Different1!",
            ),
            database,
        )
        is False
    )

    users = database.scalars(select(User)).all()
    assert len(users) == 1
    assert users[0].created_at == original_created_at
    assert users[0].password_hash == original_password_hash


def test_bootstrap_marks_an_existing_admin_complete_without_creating_another(database):
    """A pre-existing admin also makes the bootstrap operation one-time."""

    database.add(
        User(
            nus_student_number="A0123456X",
            email="existing@example.com",
            display_name="Existing Admin",
            password_hash="already-hashed",
            role="admin",
            status="deactivated",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
    )
    database.commit()

    assert bootstrap_admin(payload(email="new-admin@example.com"), database) is False
    assert database.scalar(select(User).where(User.email == "new-admin@example.com")) is None
    assert database.get(AdminStateLock, ADMIN_STATE_LOCK_NAME).bootstrap_completed_at is not None


def test_bootstrap_rejects_a_regular_account_identity_without_marking_complete(database):
    """Bootstrap never silently elevates a colliding regular account."""

    database.add(
        User(
            nus_student_number="A0123456X",
            email="existing@example.com",
            display_name="Existing User",
            password_hash="already-hashed",
            role="user",
            status="active",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
    )
    database.commit()

    with pytest.raises(BootstrapError):
        bootstrap_admin(payload(), database)

    assert database.get(AdminStateLock, ADMIN_STATE_LOCK_NAME).bootstrap_completed_at is None
    assert database.scalar(select(User).where(User.role == "admin")) is None
