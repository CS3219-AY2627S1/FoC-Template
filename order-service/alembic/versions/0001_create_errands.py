# AI Assistance Disclosure (contributor use):
# Tool: OpenAI Codex (model not recorded), dates: 2026-10-02–2026-10-22
# Scope: Implementation, debugging, refactoring, and test assistance for Order Service modules.
# Author review: I reviewed, adapted, and tested the code. Architecture and decision-rationale assistance is not attributed.

"""create errands table"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0001_create_errands"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    status = postgresql.ENUM(
        "OPEN", "ACCEPTED", "COMPLETED", "EXPIRED", "CANCELLED", "FAILED",
        name="errand_status",
        create_type=False,
    )
    status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "errands",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("status", status, server_default="OPEN", nullable=False),
        sa.Column("requester_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("courier_id", postgresql.UUID(as_uuid=True)),
        sa.Column("credit_value", sa.Integer(), nullable=False),
        sa.Column("delivery_building_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("delivery_floor", sa.String(20)),
        sa.Column("delivery_description", sa.String(500)),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("cancelled_at", sa.DateTime(timezone=True)),
        sa.Column("failed_at", sa.DateTime(timezone=True)),
        sa.Column("failure_reason", sa.String(500)),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("credit_value > 0", name="credit_value_positive"),
        sa.CheckConstraint("courier_id IS NULL OR courier_id <> requester_id", name="courier_cannot_be_requester"),
        sa.CheckConstraint("status NOT IN ('ACCEPTED', 'COMPLETED') OR courier_id IS NOT NULL", name="accepted_requires_courier"),
        sa.CheckConstraint("status <> 'FAILED' OR failure_reason IS NOT NULL", name="failed_requires_reason"),
    )

    op.create_index("idx_errands_status", "errands", ["status"])
    op.create_index("idx_errands_requester", "errands", ["requester_id"])
    op.create_index("idx_errands_open_expiry", "errands", ["expires_at"], postgresql_where=sa.text("status = 'OPEN'"))


def downgrade() -> None:
    op.drop_index("idx_errands_open_expiry", table_name="errands")
    op.drop_index("idx_errands_requester", table_name="errands")
    op.drop_index("idx_errands_status", table_name="errands")
    op.drop_table("errands")
    sa.Enum(name="errand_status").drop(op.get_bind(), checkfirst=True)


