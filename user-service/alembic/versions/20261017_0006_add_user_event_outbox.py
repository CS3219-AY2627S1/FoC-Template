"""Add the transactional User Service event outbox.

Revision ID: 20261017_0006
Revises: 20260927_0005
Create Date: 2026-10-17

"""

import sqlalchemy as sa
from alembic import op


revision = "20261017_0006"
down_revision = "20260927_0005"
branch_labels = None
depends_on = None


def _validate_existing_outbox_table(bind) -> None:
    """Adopt only the outbox shape produced by the current ORM metadata."""

    inspector = sa.inspect(bind)
    expected_nullability = {
        "id": False,
        "event_id": False,
        "event_type": False,
        "schema_version": False,
        "occurred_at": False,
        "correlation_id": False,
        "user_id": False,
        "payload": False,
        "published_at": True,
    }
    columns = {
        column["name"]: column
        for column in inspector.get_columns("user_outbox_events")
    }
    problems = [
        f"missing column {name!r}"
        for name in expected_nullability
        if name not in columns
    ]
    problems.extend(
        f"column {name!r} has unexpected nullability"
        for name, nullable in expected_nullability.items()
        if name in columns and columns[name]["nullable"] is not nullable
    )

    primary_key = inspector.get_pk_constraint("user_outbox_events")
    if primary_key.get("constrained_columns") != ["id"]:
        problems.append("primary key must be on id")

    unique_constraints = inspector.get_unique_constraints("user_outbox_events")
    unique_indexes = inspector.get_indexes("user_outbox_events")
    event_id_is_unique = any(
        constraint.get("column_names") == ["event_id"]
        for constraint in unique_constraints
    ) or any(
        index.get("column_names") == ["event_id"] and bool(index.get("unique"))
        for index in unique_indexes
    )
    if not event_id_is_unique:
        problems.append("event_id must be unique")

    if problems:
        raise RuntimeError(
            "Existing 'user_outbox_events' table does not match the expected schema: "
            + "; ".join(problems)
        )


def upgrade() -> None:
    bind = op.get_bind()
    if sa.inspect(bind).has_table("user_outbox_events"):
        _validate_existing_outbox_table(bind)
        return

    op.create_table(
        "user_outbox_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("correlation_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id", name="uq_user_outbox_event_id"),
    )
    op.create_index(
        "ix_user_outbox_unpublished",
        "user_outbox_events",
        ["id"],
        postgresql_where=sa.text("published_at IS NULL"),
    )
