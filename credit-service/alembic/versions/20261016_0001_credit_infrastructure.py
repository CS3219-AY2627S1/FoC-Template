"""Create credit accounts, reservations, audit, inbox, and outbox tables.

Revision ID: 20261016_0001
Revises:
Create Date: 2026-10-16

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "20261016_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "credit_accounts",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("nus_student_number", sa.String(length=9), nullable=False),
        sa.Column("available_balance", sa.Integer(), server_default="0", nullable=False),
        sa.Column("reserved_balance", sa.Integer(), server_default="0", nullable=False),
        sa.Column("status", sa.String(length=20), server_default="active", nullable=False),
        sa.Column("initial_allocation_granted_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "available_balance >= 0", name="ck_credit_accounts_available_nonnegative"
        ),
        sa.CheckConstraint(
            "reserved_balance >= 0", name="ck_credit_accounts_reserved_nonnegative"
        ),
        sa.CheckConstraint(
            "status IN ('active', 'suspended', 'deactivated')",
            name="ck_credit_accounts_status",
        ),
        sa.CheckConstraint(
            "length(nus_student_number) = 9",
            name="ck_credit_accounts_student_number_length",
        ),
        sa.PrimaryKeyConstraint("user_id"),
        sa.UniqueConstraint("nus_student_number"),
    )

    op.create_table(
        "credit_reservations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("requester_id", sa.Uuid(), nullable=False),
        sa.Column("courier_id", sa.Uuid()),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("correlation_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("amount > 0", name="ck_credit_reservations_amount_positive"),
        sa.CheckConstraint(
            "status IN ('ACTIVE', 'TRANSFERRED', 'RELEASED')",
            name="ck_credit_reservations_status",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("order_id"),
    )
    op.create_index(
        "ix_credit_reservations_active_requester",
        "credit_reservations",
        ["requester_id"],
        postgresql_where=sa.text("status = 'ACTIVE'"),
    )

    op.create_table(
        "credit_transactions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("event_id", sa.Uuid()),
        sa.Column("order_id", sa.Uuid()),
        sa.Column("affected_user_id", sa.Uuid(), nullable=False),
        sa.Column("counterparty_user_id", sa.Uuid()),
        sa.Column("actor_user_id", sa.Uuid()),
        sa.Column("transaction_type", sa.String(length=32), nullable=False),
        sa.Column("outcome", sa.String(length=16), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("available_delta", sa.Integer(), nullable=False),
        sa.Column("reserved_delta", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(length=500), nullable=False),
        sa.Column("correlation_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("amount > 0", name="ck_credit_transactions_amount_positive"),
        sa.CheckConstraint(
            "transaction_type IN ('INITIAL_ALLOCATION', 'RESERVATION', 'TRANSFER', "
            "'RELEASE', 'ADMIN_ADJUSTMENT')",
            name="ck_credit_transactions_type",
        ),
        sa.CheckConstraint(
            "outcome IN ('SUCCEEDED', 'REJECTED')",
            name="ck_credit_transactions_outcome",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_credit_transactions_user_created_at",
        "credit_transactions",
        ["affected_user_id", "created_at"],
    )
    op.create_index(
        "ix_credit_transactions_order_created_at",
        "credit_transactions",
        ["order_id", "created_at"],
    )

    op.create_table(
        "processed_events",
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("event_id"),
    )

    op.create_table(
        "outbox_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("correlation_id", sa.Uuid(), nullable=False),
        sa.Column("order_id", sa.Uuid()),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id", name="uq_credit_outbox_event_id"),
    )
    op.create_index(
        "ix_credit_outbox_unpublished",
        "outbox_events",
        ["id"],
        postgresql_where=sa.text("published_at IS NULL"),
    )
