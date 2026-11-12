# AI Assistance Disclosure (contributor use):
# Tool: OpenAI Codex (model not recorded), dates: 2026-10-02–2026-10-22
# Scope: Implementation, debugging, refactoring, and test assistance for Order Service modules.
# Author review: I reviewed, adapted, and tested the code. Architecture and decision-rationale assistance is not attributed.

# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-10-09 to 2026-10-15
# Scope (AI-24): Generated code, configuration and tests for the specified user event, Kafka setup and outbox changes.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

"""Create the transactional outbox relayed to Kafka by Debezium.

Column names are the defaults of Debezium's Outbox Event Router, which publishes each
inserted row to the topic named by `type`, keyed by `aggregateid`.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0004_create_outbox"
down_revision = "0003_add_required_item"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "outbox",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("aggregatetype", sa.String(255), nullable=False),
        sa.Column("aggregateid", sa.String(255), nullable=False),
        sa.Column("type", sa.String(255), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("outbox")


