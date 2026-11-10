# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-20, 2026-09-21, 2026-09-22
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-07
# Scope: Implemented User Service persistence mappings and updated account, session, audit, and
# outbox fields.
# Author review: I validated correctness and added boundary checks where needed.

"""Runtime SQLAlchemy models for the committed Supabase schema.

The models support queries and transactions only. Schema changes belong solely
in user-service/supabase/migrations and are never generated at application
startup.
"""

from __future__ import annotations

import enum
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, SmallInteger, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

USER_SERVICE_SCHEMA = "user_service"


class Base(DeclarativeBase):
    """Base class for User Service ORM query models."""


class SystemRole(enum.StrEnum):
    USER = "USER"
    ADMIN = "ADMIN"
    SUPER_ADMIN = "SUPER_ADMIN"


class AccountStatus(enum.StrEnum):
    ACTIVE = "ACTIVE"
    DELETED = "DELETED"


class OutboxEventState(enum.StrEnum):
    PENDING = "PENDING"
    PUBLISHED = "PUBLISHED"


class User(Base):
    """A verified identity. Public user IDs remain stable across capabilities."""

    __tablename__ = "users"
    __table_args__ = {"schema": USER_SERVICE_SCHEMA}

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    username: Mapped[str | None] = mapped_column(String(64), unique=True)
    normalized_username: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(254))
    normalized_email: Mapped[str | None] = mapped_column(String(254), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(64))
    system_role: Mapped[SystemRole] = mapped_column(
        Enum(
            SystemRole,
            name="system_role",
            schema=USER_SERVICE_SCHEMA,
            create_type=False,
        ),
        default=SystemRole.USER,
    )
    account_status: Mapped[AccountStatus] = mapped_column(
        Enum(
            AccountStatus,
            name="account_status",
            schema=USER_SERVICE_SCHEMA,
            create_type=False,
        ),
        default=AccountStatus.ACTIVE,
    )
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    role_version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Credential(Base):
    """One bcrypt password hash for each verified User Service identity."""

    __tablename__ = "credentials"
    __table_args__ = {"schema": USER_SERVICE_SCHEMA}

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey(f"{USER_SERVICE_SCHEMA}.users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    password_hash: Mapped[str] = mapped_column(Text)
    password_changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


class RegistrationChallenge(Base):
    """A bounded, unverified account-creation request with no plaintext secret."""

    __tablename__ = "registration_challenges"
    __table_args__ = {"schema": USER_SERVICE_SCHEMA}

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    username: Mapped[str] = mapped_column(String(64))
    normalized_username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(254))
    normalized_email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(64))
    password_hash: Mapped[str] = mapped_column(Text)
    otp_digest: Mapped[str] = mapped_column(String(64))
    otp_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    verification_attempts: Mapped[int] = mapped_column(SmallInteger, default=0)
    resend_count: Mapped[int] = mapped_column(SmallInteger, default=0)
    next_resend_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


class UserSession(Base):
    """A revocable session storing only a digest of its opaque refresh token."""

    __tablename__ = "sessions"
    __table_args__ = {"schema": USER_SERVICE_SCHEMA}

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey(f"{USER_SERVICE_SCHEMA}.users.id", ondelete="CASCADE"),
        index=True,
    )
    refresh_token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    token_family: Mapped[UUID] = mapped_column(index=True)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_active_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


class AdminAuditEntry(Base):
    """An append-only, redacted record of a successful role-lifecycle action."""

    __tablename__ = "admin_audit_entries"
    __table_args__ = {"schema": USER_SERVICE_SCHEMA}

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    actor_id: Mapped[UUID] = mapped_column(
        ForeignKey(f"{USER_SERVICE_SCHEMA}.users.id", ondelete="RESTRICT"),
        index=True,
    )
    target_user_id: Mapped[UUID] = mapped_column(
        ForeignKey(f"{USER_SERVICE_SCHEMA}.users.id", ondelete="RESTRICT"),
        index=True,
    )
    action: Mapped[str] = mapped_column(String(64))
    outcome: Mapped[str] = mapped_column(String(32))
    role_before: Mapped[SystemRole | None] = mapped_column(
        Enum(
            SystemRole,
            name="system_role",
            schema=USER_SERVICE_SCHEMA,
            create_type=False,
        )
    )
    role_after: Mapped[SystemRole | None] = mapped_column(
        Enum(
            SystemRole,
            name="system_role",
            schema=USER_SERVICE_SCHEMA,
            create_type=False,
        )
    )
    correlation_id: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


class OutboxEvent(Base):
    """A minimal, durable event awaiting safe publication to RabbitMQ."""

    __tablename__ = "outbox_events"
    __table_args__ = {"schema": USER_SERVICE_SCHEMA}

    event_id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    event_type: Mapped[str] = mapped_column(String(64))
    aggregate_id: Mapped[UUID] = mapped_column(
        ForeignKey(f"{USER_SERVICE_SCHEMA}.users.id", ondelete="RESTRICT"),
        index=True,
    )
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    state: Mapped[OutboxEventState] = mapped_column(
        Enum(
            OutboxEventState,
            name="outbox_event_state",
            schema=USER_SERVICE_SCHEMA,
            create_type=False,
        ),
        default=OutboxEventState.PENDING,
    )
    publish_attempts: Mapped[int] = mapped_column(Integer, default=0)
    next_attempt_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error_code: Mapped[str | None] = mapped_column(String(128))
    lease_token: Mapped[UUID | None] = mapped_column()
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
