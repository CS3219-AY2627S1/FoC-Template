"""Require NUS student numbers to have exactly nine characters.

Revision ID: 20260926_0003
Revises: 20260924_0002
Create Date: 2026-09-26

"""

from alembic import op


revision = "20260926_0003"
down_revision = "20260924_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Reject short or oversized student numbers at the database boundary."""

    # The API validates the full format. Keep this database constraint limited
    # to the portable length invariant so it works on SQLite and PostgreSQL.

    # Batch mode keeps this migration compatible with the SQLite databases used
    # by the migration tests while emitting a normal ALTER TABLE on PostgreSQL.
    with op.batch_alter_table("users") as batch_op:
        batch_op.create_check_constraint(
            "ck_users_nus_student_number_length",
            "length(nus_student_number) = 9",
        )


def downgrade() -> None:
    """Reject a downgrade that would remove a users-table invariant."""

    raise RuntimeError(
        "Downgrade is unsupported: removing the student-number constraint would weaken data integrity."
    )
