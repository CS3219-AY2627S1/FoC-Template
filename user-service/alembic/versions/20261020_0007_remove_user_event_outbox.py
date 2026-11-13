"""Retire the unconsumed User account-creation outbox.

Revision ID: 20261020_0007
Revises: 20261017_0006
Create Date: 2026-10-20

"""

from alembic import op


revision = "20261020_0007"
down_revision = "20261017_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("ix_user_outbox_unpublished", table_name="user_outbox_events")
    op.drop_table("user_outbox_events")
