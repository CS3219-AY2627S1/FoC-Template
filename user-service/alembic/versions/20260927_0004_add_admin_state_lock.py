"""Add the singleton lock used for administrator-state mutations.

Revision ID: 20260927_0004
Revises: 20260926_0003
Create Date: 2026-09-27

"""

from alembic import op
import sqlalchemy as sa


revision = "20260927_0004"
down_revision = "20260926_0003"
branch_labels = None
depends_on = None

LOCK_NAME = "administrator_state"


def _validate_existing_lock_table(bind) -> None:
    """Reject an existing lock table that cannot safely provide the lock row."""

    inspector = sa.inspect(bind)
    columns = {column["name"]: column for column in inspector.get_columns("admin_state_locks")}
    if "lock_name" not in columns:
        raise RuntimeError("Existing 'admin_state_locks' table is missing the lock_name column")
    if columns["lock_name"]["nullable"] is not False:
        raise RuntimeError("Existing 'admin_state_locks.lock_name' must be non-nullable")

    primary_key = inspector.get_pk_constraint("admin_state_locks")
    if primary_key.get("constrained_columns") != ["lock_name"]:
        raise RuntimeError("Existing 'admin_state_locks' table must use lock_name as its primary key")


def upgrade() -> None:
    """Create and seed the singleton administrator-state lock row."""

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("admin_state_locks"):
        _validate_existing_lock_table(bind)
    else:
        op.create_table(
            "admin_state_locks",
            sa.Column("lock_name", sa.String(length=50), nullable=False),
            sa.CheckConstraint(
                f"lock_name = '{LOCK_NAME}'",
                name="ck_admin_state_locks_name",
            ),
            sa.PrimaryKeyConstraint("lock_name"),
        )

    lock_table = sa.table(
        "admin_state_locks",
        sa.column("lock_name", sa.String(length=50)),
    )
    existing = bind.execute(
        sa.select(lock_table.c.lock_name).where(lock_table.c.lock_name == LOCK_NAME)
    ).scalar_one_or_none()
    if existing is None:
        op.bulk_insert(lock_table, [{"lock_name": LOCK_NAME}])


def downgrade() -> None:
    """Reject a downgrade that would remove administrator-state coordination."""

    raise RuntimeError(
        "Downgrade is unsupported: removing the administrator-state lock weakens account invariants."
    )
