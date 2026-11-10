# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-6.1 Sol Max), date: 2026-10-07
# Scope: Added the initial durable UserCreated outbox model
# Author review: I reviewed correctness and edited the changes to fit the project

import datetime
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, ForeignKey, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID as PostgresUUID

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"

    user_id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True), primary_key=True, default=uuid4
    )

    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False,)

    user_email: Mapped[str] = mapped_column(Text, unique=True, nullable=False,)

    password_hash: Mapped[str] = mapped_column(Text, nullable=False,)

    user_role: Mapped[str] = mapped_column(Text, nullable=False, default="user")

    created_at: Mapped[datetime.datetime] = mapped_column(
        default=lambda: datetime.datetime.now(datetime.timezone.utc), nullable=False)

    updated_at: Mapped[datetime.datetime] = mapped_column(
    default=lambda: datetime.datetime.now(datetime.timezone.utc), nullable=False)

    __table_args__ = (
        CheckConstraint(
            "user_email LIKE '%@%.%'",
            name="valid_user_email",
        ),
        CheckConstraint(
            "user_role IN ('user', 'admin', 'admin_manager')",
            name="valid_user_role",
        ),
    )


class AuthenticationSession(Base):
    __tablename__ = "authentication_sessions"

    access_token_hash: Mapped[str] = mapped_column(Text, primary_key=True)

    user_id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
    )

    created_at: Mapped[datetime.datetime] = mapped_column(
        default=lambda: datetime.datetime.now(datetime.timezone.utc),
        nullable=False,
    )

    expires_at: Mapped[datetime.datetime] = mapped_column(nullable=False)


class UserCreatedOutbox(Base):
    __tablename__ = "user_created_outbox"

    user_id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True), primary_key=True,
    )
    event: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(nullable=False)
    published_at: Mapped[datetime.datetime | None] = mapped_column(nullable=True)
