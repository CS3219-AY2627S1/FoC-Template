"""Add transactional outbox for chat message events.

AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-5), date: 2026-11-08
Scope: Generated and refined this Chat Service migration.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0003_add_message_outbox"
down_revision = "0002_add_post_completion_grace"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "outbox",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("aggregatetype", sa.String(255), nullable=False),
        sa.Column("aggregateid", sa.String(255), nullable=False),
        sa.Column("type", sa.String(255), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("outbox")

