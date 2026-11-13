"""Add the durable first-administrator bootstrap marker.

Revision ID: 20260927_0005
Revises: 20260927_0004
Create Date: 2026-09-27

"""

from alembic import op
import sqlalchemy as sa


revision = "20260927_0005"
down_revision = "20260927_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add a nullable timestamp written when the first-admin job succeeds."""

    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("admin_state_locks")}
    if "bootstrap_completed_at" not in columns:
        op.add_column(
            "admin_state_locks",
            sa.Column("bootstrap_completed_at", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    """Reject a downgrade that would permit the initial admin to be recreated."""

    raise RuntimeError(
        "Downgrade is unsupported: removing the bootstrap marker weakens account invariants."
    )
