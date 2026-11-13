"""PostgreSQL integration tests for administrator-state concurrency."""

import os
import threading
from concurrent.futures import ThreadPoolExecutor
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, delete, inspect, select
from sqlalchemy.orm import Session

from app.models import ADMIN_STATE_LOCK_NAME, AdminStateLock, User
from app.schemas import UserCreate, UserLogin
from app.services import users as user_service
from app.services.users import register_user


TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not TEST_DATABASE_URL,
    reason="Set TEST_DATABASE_URL to run PostgreSQL concurrency tests",
)


@pytest.fixture(scope="module")
def postgres_engine():
    """Provide a migrated PostgreSQL engine for concurrent sessions."""

    assert TEST_DATABASE_URL is not None
    if not TEST_DATABASE_URL.startswith("postgresql"):
        pytest.fail("TEST_DATABASE_URL must point to PostgreSQL")

    engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
    try:
        required_tables = {"users", "user_sessions", "admin_state_locks"}
        tables = set(inspect(engine).get_table_names())
        missing_tables = required_tables - tables
        if missing_tables:
            pytest.fail(
                "Run 'python -m alembic upgrade head' before PostgreSQL "
                f"concurrency tests; missing tables: {sorted(missing_tables)}"
            )

        with Session(engine) as db:
            if db.get(AdminStateLock, ADMIN_STATE_LOCK_NAME) is None:
                pytest.fail("The administrator-state lock row has not been migrated")

        yield engine
    finally:
        engine.dispose()


def create_user(database: Session, label: str, *, role="user", status="active") -> User:
    """Create a uniquely named account for a concurrency scenario."""

    user = register_user(
        UserCreate(
            nus_student_number=f"A{uuid4().int % 10_000_000:07d}X",
            email=f"{uuid4().hex}@example.com",
            display_name=f"Concurrent {label}",
            password="Password1!",
        ),
        database,
    )
    user.role = role
    user.status = status
    database.commit()
    database.refresh(user)
    return user


def delete_users(database: Session, user_ids: list[UUID]) -> None:
    """Remove only the accounts created by a concurrency test."""

    database.execute(delete(User).where(User.id.in_(user_ids)))
    database.commit()


def synchronize_admin_lock(monkeypatch):
    """Make both workers reach the real database lock before either proceeds."""

    barrier = threading.Barrier(2)
    original_lock = user_service._lock_admin_state

    def synchronized_lock(database: Session) -> None:
        try:
            barrier.wait(timeout=15)
        except threading.BrokenBarrierError as exc:
            raise AssertionError("Concurrent workers did not reach the admin lock") from exc
        original_lock(database)

    monkeypatch.setattr(user_service, "_lock_admin_state", synchronized_lock)


def run_concurrently(*workers):
    """Run workers in separate threads and return their results."""

    with ThreadPoolExecutor(max_workers=len(workers)) as executor:
        futures = [executor.submit(worker) for worker in workers]
        return [future.result(timeout=30) for future in futures]


def deactivate_in_session(engine, user_id: UUID) -> int:
    """Run self-deactivation in an independent database session."""

    with Session(engine) as database:
        user = database.get(User, user_id)
        assert user is not None
        try:
            user_service.deactivate_user(user, database)
        except HTTPException as exc:
            return exc.status_code
        return 200


def revoke_in_session(engine, actor_id: UUID, target_id: UUID) -> int:
    """Run administrator-rights revocation in an independent session."""

    with Session(engine) as database:
        try:
            user_service.revoke_admin_rights(actor_id, target_id, database)
        except HTTPException as exc:
            return exc.status_code
        return 200


def reactivate_in_session(engine, student_number: str) -> int:
    """Run credential-based reactivation in an independent session."""

    with Session(engine) as database:
        try:
            user_service.reactivate_user(
                UserLogin(
                    nus_student_number=student_number,
                    password="Password1!",
                ),
                database,
            )
        except HTTPException as exc:
            return exc.status_code
        return 200


def test_concurrent_admin_deactivation_preserves_an_active_admin(
    postgres_engine, monkeypatch
):
    """Concurrent self-deactivation cannot remove the final active admin."""

    with Session(postgres_engine) as database:
        first = create_user(database, "First Admin", role="admin")
        second = create_user(database, "Second Admin", role="admin")
        user_ids = [first.id, second.id]

    try:
        synchronize_admin_lock(monkeypatch)
        statuses = run_concurrently(
            lambda: deactivate_in_session(postgres_engine, first.id),
            lambda: deactivate_in_session(postgres_engine, second.id),
        )

        assert sorted(statuses) == [200, 409]
        with Session(postgres_engine) as database:
            active_admins = database.scalars(
                select(User).where(User.id.in_(user_ids), User.status == "active")
            ).all()
            assert len(active_admins) == 1
    finally:
        with Session(postgres_engine) as database:
            delete_users(database, user_ids)


def test_concurrent_mutual_admin_revocation_preserves_an_admin(
    postgres_engine, monkeypatch
):
    """Concurrent mutual revocation serializes before rechecking each actor."""

    with Session(postgres_engine) as database:
        first = create_user(database, "First Admin", role="admin")
        second = create_user(database, "Second Admin", role="admin")
        user_ids = [first.id, second.id]

    try:
        synchronize_admin_lock(monkeypatch)
        statuses = run_concurrently(
            lambda: revoke_in_session(postgres_engine, first.id, second.id),
            lambda: revoke_in_session(postgres_engine, second.id, first.id),
        )

        assert sorted(statuses) == [200, 403]
        with Session(postgres_engine) as database:
            admins = database.scalars(
                select(User).where(User.id.in_(user_ids), User.role == "admin")
            ).all()
            assert len(admins) == 1
    finally:
        with Session(postgres_engine) as database:
            delete_users(database, user_ids)


def test_concurrent_reactivation_and_admin_revocation_do_not_lose_updates(
    postgres_engine, monkeypatch
):
    """Concurrent status and role changes both survive singleton-lock serialization."""

    with Session(postgres_engine) as database:
        actor = create_user(database, "Actor Admin", role="admin")
        target = create_user(
            database,
            "Suspended Admin",
            role="admin",
            status="deactivated",
        )
        target_student_number = target.nus_student_number
        user_ids = [actor.id, target.id]

    try:
        synchronize_admin_lock(monkeypatch)
        statuses = run_concurrently(
            lambda: revoke_in_session(postgres_engine, actor.id, target.id),
            lambda: reactivate_in_session(postgres_engine, target_student_number),
        )

        assert sorted(statuses) == [200, 200]
        with Session(postgres_engine) as database:
            refreshed_target = database.get(User, target.id)
            assert refreshed_target is not None
            assert refreshed_target.role == "user"
            assert refreshed_target.status == "active"
    finally:
        with Session(postgres_engine) as database:
            delete_users(database, user_ids)
