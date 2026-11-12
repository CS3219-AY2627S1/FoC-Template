"""Allow chat for thirty minutes after completion.

AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-5), date: 2026-11-08
Scope: Generated and refined this Chat Service migration.
"""

from alembic import op
import sqlalchemy as sa


revision = "0002_add_post_completion_grace"
down_revision = "0001_create_chat_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "conversations",
        sa.Column("chat_closes_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Preserve the intended grace period for completed rows that existed before
    # this migration. Their old closed_at value is the recorded completion time.
    op.execute(
        """
        UPDATE conversations
        SET chat_closes_at = closed_at + INTERVAL '30 minutes'
        WHERE delivery_status = 'COMPLETED'
          AND closed_at IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_column("conversations", "chat_closes_at")

