"""user reports store an advisory AI assessment

Revision ID: 0007_report_ai
Revises: 0006_appeal_ai
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0007_report_ai"
down_revision = "0006_appeal_ai"
branch_labels = None
depends_on = None


def upgrade() -> None:
    recommendation = postgresql.ENUM(
        "dismiss", "suspend", "unsure", name="reportrecommendation", create_type=False
    )
    recommendation.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "user_reports",
        sa.Column("ai_recommendation", recommendation, nullable=True),
    )
    op.add_column("user_reports", sa.Column("ai_confidence", sa.Float(), nullable=True))
    op.add_column("user_reports", sa.Column("ai_reasoning", sa.Text(), nullable=True))
    op.add_column(
        "user_reports",
        sa.Column("ai_completed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user_reports", "ai_completed_at")
    op.drop_column("user_reports", "ai_reasoning")
    op.drop_column("user_reports", "ai_confidence")
    op.drop_column("user_reports", "ai_recommendation")
    postgresql.ENUM(name="reportrecommendation").drop(op.get_bind(), checkfirst=True)
