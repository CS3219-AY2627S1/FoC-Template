"""Add persisted bearer sessions.

Revision ID: 20260924_0002
Revises: 20260924_0001
Create Date: 2026-09-24

"""

from alembic import op
import sqlalchemy as sa


revision = "20260924_0002"
down_revision = "20260924_0001"
branch_labels = None
depends_on = None


def _validate_existing_user_sessions_table(bind) -> None:
    """Reject an existing session table that is not the known legacy schema."""

    inspector = sa.inspect(bind)
    expected_columns = {
        "id": False,
        "user_id": False,
        "token_hash": False,
        "created_at": False,
        "last_activity_at": False,
        "expires_at": False,
        "absolute_expires_at": False,
        "revoked_at": True,
    }
    columns = {
        column["name"]: column for column in inspector.get_columns("user_sessions")
    }
    problems = [
        f"missing column {name!r}"
        for name in expected_columns
        if name not in columns
    ]
    problems.extend(
        f"column {name!r} has unexpected nullability"
        for name, nullable in expected_columns.items()
        if name in columns and columns[name]["nullable"] is not nullable
    )

    primary_key = inspector.get_pk_constraint("user_sessions")
    if primary_key.get("constrained_columns") != ["id"]:
        problems.append("primary key must be on id")

    indexes = inspector.get_indexes("user_sessions")
    for columns, unique in ((["user_id"], False), (["token_hash"], True)):
        if not any(
            index.get("column_names") == columns
            and bool(index.get("unique")) is unique
            for index in indexes
        ):
            uniqueness = "unique " if unique else ""
            problems.append(f"missing {uniqueness}index on {columns[0]!r}")

    foreign_keys = inspector.get_foreign_keys("user_sessions")
    if not any(
        foreign_key.get("constrained_columns") == ["user_id"]
        and foreign_key.get("referred_table") == "users"
        and foreign_key.get("referred_columns") == ["id"]
        and (foreign_key.get("options") or {}).get("ondelete", "").upper() == "CASCADE"
        for foreign_key in foreign_keys
    ):
        problems.append("missing user_id foreign key to users.id with ON DELETE CASCADE")

    if problems:
        raise RuntimeError(
            "Existing 'user_sessions' table does not match the expected legacy schema: "
            + "; ".join(problems)
        )


def upgrade() -> None:
    """Create the table used to persist opaque authentication sessions."""

    # Existing deployments may already have this table because it was also
    # created by the application's previous create_all() startup path.
    bind = op.get_bind()
    if sa.inspect(bind).has_table("user_sessions"):
        _validate_existing_user_sessions_table(bind)
        return

    op.create_table(
        "user_sessions",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("absolute_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"], unique=False)
    op.create_index(
        "ix_user_sessions_token_hash",
        "user_sessions",
        ["token_hash"],
        unique=True,
    )


def downgrade() -> None:
    """Reject a downgrade that would invalidate every persisted session."""

    raise RuntimeError(
        "Downgrade is unsupported: reverting this migration would delete all user sessions."
    )
