"""Parked credit messages that the dead-letter topic could not accept.

Revision ID: 20261022_0002
Revises: 20261005_0001
Create Date: 2026-10-22

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "20261022_0002"
down_revision: Union[str, None] = "20261005_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "parked_messages",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("source_topic", sa.String(length=255), nullable=False),
        sa.Column("source_partition", sa.Integer(), nullable=False),
        sa.Column("source_offset", sa.BigInteger(), nullable=False),
        sa.Column("key", sa.LargeBinary(), nullable=True),
        sa.Column("value", sa.LargeBinary(), nullable=True),
        sa.Column("headers", sa.JSON(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "source_topic",
            "source_partition",
            "source_offset",
            name="uq_parked_messages_source",
        ),
    )


def downgrade() -> None:
    op.drop_table("parked_messages")
