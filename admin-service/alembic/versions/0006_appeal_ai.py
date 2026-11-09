"""suspension appeals store an advisory AI assessment

Revision ID: 0006_appeal_ai
Revises: 0005_appeal_rejection_reason
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0006_appeal_ai"
down_revision = "0005_appeal_rejection_reason"
branch_labels = None
depends_on = None


def upgrade() -> None:
    recommendation = postgresql.ENUM(
        "uphold", "reinstate", "unsure", name="appealrecommendation", create_type=False
    )
    recommendation.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "suspension_appeals",
        sa.Column("ai_recommendation", recommendation, nullable=True),
    )
    op.add_column("suspension_appeals", sa.Column("ai_confidence", sa.Float(), nullable=True))
    op.add_column("suspension_appeals", sa.Column("ai_reasoning", sa.Text(), nullable=True))
    op.add_column(
        "suspension_appeals",
        sa.Column("ai_completed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("suspension_appeals", "ai_completed_at")
    op.drop_column("suspension_appeals", "ai_reasoning")
    op.drop_column("suspension_appeals", "ai_confidence")
    op.drop_column("suspension_appeals", "ai_recommendation")
    postgresql.ENUM(name="appealrecommendation").drop(op.get_bind(), checkfirst=True)
