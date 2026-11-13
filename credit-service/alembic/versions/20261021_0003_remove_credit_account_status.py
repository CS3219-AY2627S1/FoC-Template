"""Remove Credit-owned account lifecycle status.

Revision ID: 20261021_0003
Revises: 20261020_0002
Create Date: 2026-10-21

"""

from alembic import op


revision = "20261021_0003"
down_revision = "20261020_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint(
        "ck_credit_accounts_status",
        "credit_accounts",
        type_="check",
    )
    op.drop_column("credit_accounts", "status")
