"""Initial order, outbox, and processed-event tables.

Revision ID: 20261005_0001
Revises:
Create Date: 2026-10-05

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "20261005_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_STATUS_CHECK = (
    "status IN ('PENDING_CREDIT', 'OPEN', 'REJECTED', 'ACCEPTED', "
    "'PICKED_UP', 'COMPLETED', 'CANCELLED', 'EXPIRED')"
)


def upgrade() -> None:
    op.create_table(
        "orders",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("requester_id", sa.Uuid(), nullable=False),
        sa.Column("pickup_supplier_id", sa.Uuid(), nullable=False),
        sa.Column("delivery_label", sa.String(length=200), nullable=False),
        sa.Column("delivery_latitude", sa.Float(), nullable=False),
        sa.Column("delivery_longitude", sa.Float(), nullable=False),
        sa.Column("delivery_details", sa.String(length=500), nullable=False),
        sa.Column("item_description", sa.String(length=500), nullable=False),
        sa.Column("credit_amount", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("courier_id", sa.Uuid(), nullable=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("picked_up_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_by", sa.Uuid(), nullable=True),
        sa.Column("expired_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("correlation_id", sa.Uuid(), nullable=False),
        sa.Column("rejection_reason", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("credit_amount > 0", name="ck_orders_credit_amount_positive"),
        sa.CheckConstraint(_STATUS_CHECK, name="ck_orders_status"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "requester_id",
            "idempotency_key",
            name="uq_orders_requester_idempotency",
        ),
    )
    op.create_index(
        "ix_orders_requester_created_at",
        "orders",
        ["requester_id", "created_at"],
    )
    op.create_index(
        "ix_orders_courier_created_at",
        "orders",
        ["courier_id", "created_at"],
    )
    op.create_index(
        "ix_orders_open_created_at",
        "orders",
        ["created_at"],
        postgresql_where=sa.text("status = 'OPEN'"),
    )

    op.create_table(
        "outbox_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("correlation_id", sa.Uuid(), nullable=False),
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id", name="uq_outbox_events_event_id"),
    )
    op.create_index(
        "ix_outbox_events_unpublished",
        "outbox_events",
        ["id"],
        postgresql_where=sa.text("published_at IS NULL"),
    )

    op.create_table(
        "processed_events",
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("event_id"),
    )


def downgrade() -> None:
    op.drop_table("processed_events")
    op.drop_index("ix_outbox_events_unpublished", table_name="outbox_events")
    op.drop_table("outbox_events")
    op.drop_index("ix_orders_open_created_at", table_name="orders")
    op.drop_index("ix_orders_courier_created_at", table_name="orders")
    op.drop_index("ix_orders_requester_created_at", table_name="orders")
    op.drop_table("orders")
