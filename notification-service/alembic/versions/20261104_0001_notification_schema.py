# AI Assistance Disclosure:
# Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-04
# Scope: Writing implementation code — write the revision creating processed_events and notifications to the user-specified schema (columns, types, nullability, defaults, CHECK on recipient_role, UNIQUE (event_id, recipient_id), the (recipient_id, id DESC) index, and the read_at IS NULL partial index) with a downgrade that drops both tables (ai-20261104-001).
# Author review: Keith confirmed that all tests and manual verification were completed and approved, and confirmed rerunning the tests himself, with commands and results unspecified (ai-20261104-001).
# Details: notification-service/ai/usage-log.md; ai-20261104-001

"""Create processed_events and notifications tables.

Revision ID: 20261104_0001
Revises:
Create Date: 2026-11-04

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "20261104_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "processed_events",
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("event_id"),
    )

    op.create_table(
        "notifications",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("recipient_id", sa.Uuid(), nullable=False),
        sa.Column("recipient_role", sa.String(length=16), nullable=False),
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("type", sa.String(length=64), nullable=False),
        sa.Column(
            "params",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "recipient_role IN ('requester', 'courier')",
            name="ck_notifications_recipient_role",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "event_id", "recipient_id", name="uq_notifications_event_recipient"
        ),
    )
    op.create_index(
        "ix_notifications_recipient_id_desc",
        "notifications",
        ["recipient_id", sa.text("id DESC")],
    )
    op.create_index(
        "ix_notifications_recipient_unread",
        "notifications",
        ["recipient_id"],
        postgresql_where=sa.text("read_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_notifications_recipient_unread", table_name="notifications")
    op.drop_index("ix_notifications_recipient_id_desc", table_name="notifications")
    op.drop_table("notifications")
    op.drop_table("processed_events")
