# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-13
# Scope: Implemented query-only table definitions for the Credit ledger.
# Author review: I validated correctness and supplied additional boundary checks.

"""Query metadata only. Supabase SQL migrations exclusively own the schema."""

from sqlalchemy import (
    UUID,
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Integer,
    MetaData,
    Table,
    Text,
)

metadata = MetaData(schema="credit_service")

wallets = Table(
    "wallets",
    metadata,
    Column("user_id", UUID, primary_key=True),
    Column("available", BigInteger, nullable=False),
    Column("reserved", BigInteger, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
)

reservations = Table(
    "order_reservations",
    metadata,
    Column("order_id", UUID, primary_key=True),
    Column("reservation_id", UUID),
    Column("operation_id", UUID, nullable=False),
    Column("requester_id", UUID, nullable=False),
    Column("amount", Integer, nullable=False),
    Column("state", Text, nullable=False),
    Column("courier_id", UUID),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
)

transactions = Table(
    "credit_transactions",
    metadata,
    Column("id", UUID, primary_key=True),
    Column("type", Text, nullable=False),
    Column("amount", Integer, nullable=False),
    Column("wallet_user_id", UUID, nullable=False),
    Column("counterparty_user_id", UUID),
    Column("order_id", UUID),
    Column("reservation_id", UUID),
    Column("source_event_id", UUID),
    Column("created_at", DateTime(timezone=True), nullable=False),
)

processed_events = Table(
    "processed_events",
    metadata,
    Column("event_id", UUID, primary_key=True),
    Column("event_type", Text, nullable=False),
    Column("entity_id", UUID, nullable=False),
    Column("consumer", Text, nullable=False),
    Column("outcome", Text, nullable=False),
    Column("attempt", Integer, nullable=False),
    Column("processed_at", DateTime(timezone=True), nullable=False),
)

event_failures = Table(
    "event_failures",
    metadata,
    Column("id", BigInteger, primary_key=True),
    Column("event_id", UUID),
    Column("event_type", Text),
    Column("entity_id", UUID),
    Column("consumer", Text, nullable=False),
    Column("attempt", Integer, nullable=False),
    Column("error_code", Text, nullable=False),
    Column("dead_lettered", Boolean, nullable=False),
    Column("failed_at", DateTime(timezone=True), nullable=False),
)
