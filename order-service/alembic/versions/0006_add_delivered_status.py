# AI Assistance Disclosure (contributor use):
# Tool: OpenAI Codex (model not recorded), dates: 2026-10-02–2026-10-22
# Scope: Implementation, debugging, refactoring, and test assistance for Order Service modules.
# Author review: I reviewed, adapted, and tested the code. Architecture and decision-rationale assistance is not attributed.

"""Add DELIVERED status and delivery timestamp."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0006_add_delivered_status"
down_revision: Union[str, Sequence[str], None] = "0005_credit_integration"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE errand_status ADD VALUE IF NOT EXISTS 'DELIVERED'")
    op.add_column(
        "errands",
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("errands", "delivered_at")


