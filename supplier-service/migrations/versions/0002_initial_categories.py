# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-28 to 2026-09-29
# Scope: Writing implementation code — insert controlled categories with permanent UUIDs and guarded downgrade behavior.
# Author review: Keith confirmed review of all affected changes.
# Details: ../../ai/usage-log.md; ai-20260929-001

"""Seed the controlled categories with permanent, once-generated UUIDs."""

from uuid import UUID

from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

CATEGORIES = (
    (UUID("90909a88-65cc-4150-8b71-abc339d0c033"), "Food"),
    (UUID("92f0136e-5617-4380-9367-b2991ceda339"), "Coffee"),
    (UUID("e80d50ef-3a8a-43d7-a39e-6a4beb42ea22"), "Shopping"),
    (UUID("419a5b1b-bb4c-4869-a9a3-9b5b1793add2"), "Printing"),
)
category = sa.table("category", sa.column("id", sa.UUID()), sa.column("name", sa.Text()))


def upgrade() -> None:
    op.bulk_insert(category, [{"id": id_, "name": name} for id_, name in CATEGORIES])


def downgrade() -> None:
    # Foreign keys deliberately block removal of categories still in use.
    op.execute(category.delete().where(category.c.id.in_([id_ for id_, _ in CATEGORIES])))
