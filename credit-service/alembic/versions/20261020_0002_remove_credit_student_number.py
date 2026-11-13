"""Make Credit accounts UUID-only.

Revision ID: 20261020_0002
Revises: 20261016_0001
Create Date: 2026-10-20

"""

from alembic import op


revision = "20261020_0002"
down_revision = "20261016_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # These are the concrete PostgreSQL names created by the baseline
    # CheckConstraint and unnamed UniqueConstraint respectively.
    op.drop_constraint(
        "ck_credit_accounts_student_number_length",
        "credit_accounts",
        type_="check",
    )
    op.drop_constraint(
        "credit_accounts_nus_student_number_key",
        "credit_accounts",
        type_="unique",
    )
    op.drop_column("credit_accounts", "nus_student_number")
