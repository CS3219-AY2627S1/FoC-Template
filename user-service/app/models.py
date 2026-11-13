"""SQLAlchemy models for the User Service."""

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


ADMIN_STATE_LOCK_NAME = "administrator_state"


def utc_now() -> datetime:
    """Return the current timezone-aware UTC timestamp."""

    return datetime.now(timezone.utc)


class User(Base):
    """Persisted user account and profile data."""

    __tablename__ = "users"
    __table_args__ = (
        # API schemas enforce the full student-number format; this portable
        # database invariant protects the required length for every write path.
        CheckConstraint(
            "length(nus_student_number) = 9",
            name="ck_users_nus_student_number_length",
        ),
        CheckConstraint("role IN ('user', 'admin')", name="ck_users_role"),
        CheckConstraint(
            "status IN ('active', 'deactivated', 'suspended')",
            name="ck_users_status",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4, nullable=False)
    nus_student_number: Mapped[str] = mapped_column(
        String(9), unique=True, index=True, nullable=False
    )
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(254), nullable=False)
    role: Mapped[str] = mapped_column(
        String(20), default="user", server_default="user", nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(20), default="active", server_default="active", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )


class UserSession(Base):
    """Persisted opaque authentication session for a user."""

    __tablename__ = "user_sessions"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4, nullable=False)
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    last_activity_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    absolute_expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AdminStateLock(Base):
    """Singleton row used to serialize administrator-state mutations."""

    __tablename__ = "admin_state_locks"
    __table_args__ = (
        CheckConstraint(
            f"lock_name = '{ADMIN_STATE_LOCK_NAME}'",
            name="ck_admin_state_locks_name",
        ),
    )

    lock_name: Mapped[str] = mapped_column(String(50), primary_key=True, nullable=False)
    bootstrap_completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
