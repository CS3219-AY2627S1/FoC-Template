"""suspension appeals keep the reason shown to the user

Revision ID: 0005_appeal_rejection_reason
Revises: 0004_user_reports_and_appeals
"""
import sqlalchemy as sa
from alembic import op

revision = "0005_appeal_rejection_reason"
down_revision = "0004_user_reports_and_appeals"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("suspension_appeals", sa.Column("rejection_reason", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("suspension_appeals", "rejection_reason")
