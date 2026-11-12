# AI Assistance Disclosure (contributor use):
# Tool: OpenAI Codex (model not recorded), dates: 2026-10-02–2026-10-22
# Scope: Implementation, debugging, refactoring, and test assistance for Order Service modules.
# Author review: I reviewed, adapted, and tested the code. Architecture and decision-rationale assistance is not attributed.

"""Persist reservation IDs and recoverable credit-operation intents."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0005_credit_integration"
down_revision = "0004_create_outbox"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("errands", sa.Column("credit_reservation_id", postgresql.UUID(as_uuid=True)))
    op.add_column("errands", sa.Column("pending_credit_action", sa.String(20)))
    op.create_unique_constraint("uq_errands_credit_reservation", "errands", ["credit_reservation_id"])
    op.create_table(
        "credit_operations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("errand_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("requester_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("request_key", sa.String(160), nullable=False),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("state", sa.String(20), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("reservation_id", postgresql.UUID(as_uuid=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("requester_id", "request_key", name="uq_credit_request"),
    )
    op.create_index("ix_credit_operations_errand_id", "credit_operations", ["errand_id"])


def downgrade():
    op.drop_table("credit_operations")
    op.drop_constraint("uq_errands_credit_reservation", "errands", type_="unique")
    op.drop_column("errands", "pending_credit_action")
    op.drop_column("errands", "credit_reservation_id")


