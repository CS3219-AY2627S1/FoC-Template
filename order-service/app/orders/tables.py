# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09, 2026-10-11
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11
# Scope: Implemented runtime SQLAlchemy mappings for Order-owned tables.
# Author review: I validated correctness and added boundary checks where needed.

"""Query metadata only. Supabase SQL migrations exclusively own the schema."""

from sqlalchemy import (
    UUID,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    MetaData,
    String,
    Table,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB

metadata = MetaData(schema="order_service")

operations = Table(
    "creation_operations",
    metadata,
    Column("id", UUID, primary_key=True),
    Column("order_id", UUID, nullable=False),
    Column("requester_id", UUID, nullable=False),
    Column("key_hash", String(64), nullable=False),
    Column("request_hash", String(64), nullable=False),
    Column("payload", JSONB, nullable=False),
    Column("supplier_snapshot", JSONB, nullable=False),
    Column("stage", Text, nullable=False),
    Column("reservation_id", UUID),
    Column("error_code", Text),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("acceptance_deadline", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
    Column("lease_token", UUID),
    Column("lease_until", DateTime(timezone=True)),
    Column("next_attempt_at", DateTime(timezone=True), nullable=False),
    Column("attempts", Integer, nullable=False),
)

orders = Table(
    "orders",
    metadata,
    Column("id", UUID, primary_key=True),
    Column("requester_id", UUID, nullable=False),
    Column("courier_id", UUID),
    Column("accepted_at", DateTime(timezone=True)),
    Column("cancelled_at", DateTime(timezone=True)),
    Column("expired_at", DateTime(timezone=True)),
    Column("picked_up_at", DateTime(timezone=True)),
    Column("delivered_at", DateTime(timezone=True)),
    Column("completed_at", DateTime(timezone=True)),
    Column("overdue_at", DateTime(timezone=True)),
    Column("failed_at", DateTime(timezone=True)),
    Column("failed_by", UUID),
    Column("failure_reason", Text),
    Column("failure_details", Text),
    Column("decided_by", UUID),
    Column("decision_dispute_id", UUID),
    Column("dispute_id", UUID),
    Column("disputed_from_state", Text),
    Column("disputed_at", DateTime(timezone=True)),
    Column("supplier_id", UUID, nullable=False),
    Column("supplier_snapshot", JSONB, nullable=False),
    Column("item_description", Text, nullable=False),
    Column("delivery_location", Text, nullable=False),
    Column("reward", Integer, nullable=False),
    Column("state", Text, nullable=False),
    Column("reservation_id", UUID, nullable=False),
    Column("acceptance_deadline", DateTime(timezone=True), nullable=False),
    Column("delivery_deadline", DateTime(timezone=True), nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
)

history = Table(
    "order_history",
    metadata,
    Column("order_id", UUID, ForeignKey("order_service.orders.id"), primary_key=True),
    Column("sequence", Integer, primary_key=True),
    Column("previous_state", Text),
    Column("new_state", Text, nullable=False),
    Column("actor_id", UUID),
    Column("actor_type", Text, nullable=False),
    Column("occurred_at", DateTime(timezone=True), nullable=False),
    Column("failure_reason", Text),
    Column("failure_details", Text),
    Column("dispute_id", UUID),
)

outbox = Table(
    "outbox_events",
    metadata,
    Column("event_id", UUID, primary_key=True),
    Column("event_type", Text, nullable=False),
    Column("requester_id", UUID),
    Column("courier_id", UUID),
    Column("amount", Integer),
    Column("order_id", UUID, ForeignKey("order_service.orders.id"), nullable=False),
    Column("reservation_id", UUID, nullable=False),
    Column("occurred_at", DateTime(timezone=True), nullable=False),
    Column("state", Text, nullable=False),
    Column("publish_attempts", Integer, nullable=False),
    Column("next_attempt_at", DateTime(timezone=True), nullable=False),
    Column("lease_token", UUID),
    Column("lease_until", DateTime(timezone=True)),
    Column("published_at", DateTime(timezone=True)),
    Column("last_error_code", Text),
)
