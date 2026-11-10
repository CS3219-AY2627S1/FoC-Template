# AI-INFLUENCED: Add delivery coordinates to orders with GitHub Copilot Chat.
"""Store the delivery point coordinates picked on the order map."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20261110_order_delivery_coordinates"
down_revision = "20261106_order_proof_photo"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("delivery_latitude", sa.Float(), nullable=True))
    op.add_column("orders", sa.Column("delivery_longitude", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("orders", "delivery_longitude")
    op.drop_column("orders", "delivery_latitude")
