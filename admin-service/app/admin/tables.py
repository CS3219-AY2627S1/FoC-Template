# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28, 2026-10-29, 2026-11-08,
# 2026-11-10
# Scope: Implemented query-only table definitions for disputes, their history, statements and
# the audit log.
# Author review: I validated correctness and supplied additional boundary checks.

"""Query-only table definitions. supabase/migrations/ owns the schema."""

from sqlalchemy import Boolean, Column, DateTime, Integer, MetaData, Table, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID

metadata = MetaData(schema="admin_service")

disputes = Table(
    "disputes",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    Column("order_id", UUID(as_uuid=True), nullable=False),
    Column("description", Text),
    Column("evidence_refs", ARRAY(Text), nullable=False),
    Column("status", Text, nullable=False),
    Column("resolution_reason", Text),
    Column("reporter_role", Text),
    Column("problem", Text),
    Column("legacy_record", Boolean, nullable=False),
    Column("problem_details", Text),
    Column("created_by", UUID(as_uuid=True), nullable=False),
    Column("idempotency_key", UUID(as_uuid=True), nullable=False),
    Column("request_hash", Text, nullable=False),
    Column("version", Integer, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
)

dispute_events = Table(
    "dispute_events",
    metadata,
    Column("dispute_id", UUID(as_uuid=True), primary_key=True),
    Column("sequence", Integer, primary_key=True),
    Column("from_status", Text),
    Column("to_status", Text, nullable=False),
    Column("actor_id", UUID(as_uuid=True), nullable=False),
    Column("reason", Text),
    Column("occurred_at", DateTime(timezone=True), nullable=False),
)

dispute_statements = Table(
    "dispute_statements",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    Column("dispute_id", UUID(as_uuid=True), nullable=False),
    Column("author_id", UUID(as_uuid=True), nullable=False),
    Column("author_role", Text, nullable=False),
    Column("body", Text, nullable=False),
    Column("idempotency_key", UUID(as_uuid=True), nullable=False),
    Column("request_hash", Text, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
)

audit_log = Table(
    "audit_log",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    Column("actor_id", UUID(as_uuid=True), nullable=False),
    Column("action", Text, nullable=False),
    Column("target_type", Text, nullable=False),
    Column("target_id", UUID(as_uuid=True), nullable=False),
    Column("outcome", Text, nullable=False),
    Column("error_code", Text),
    Column("correlation_id", Text, nullable=False),
    Column("occurred_at", DateTime(timezone=True), nullable=False),
)
