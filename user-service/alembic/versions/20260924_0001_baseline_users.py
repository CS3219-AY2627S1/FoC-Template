"""Create the existing users table.

Revision ID: 20260924_0001
Revises:
Create Date: 2026-09-24

"""

import re

from alembic import op
import sqlalchemy as sa


revision = "20260924_0001"
down_revision = None
branch_labels = None
depends_on = None


def _check_constraint_matches(
    sqltext: str, column: str, allowed_values: set[str]
) -> bool:
    """Match a check semantically across SQLite and PostgreSQL renderings."""

    normalized = " ".join(sqltext.lower().split())
    literals = set(re.findall(r"'([^']*)'", normalized))
    padded = f" {normalized} "
    uses_membership = " in " in padded or " any " in padded
    return (
        column.lower() in normalized
        and literals == {value.lower() for value in allowed_values}
        and uses_membership
        and " not in " not in padded
    )


def _column_type_matches(column, expected: str, length: int | None, dialect_name: str) -> bool:
    """Match a legacy column type across the SQLite and PostgreSQL renderings."""

    actual = column["type"]

    if expected == "uuid":
        if dialect_name == "sqlite":
            return isinstance(actual, sa.CHAR) and actual.length == 32
        return isinstance(actual, sa.Uuid)

    if expected == "string":
        return (
            isinstance(actual, sa.String)
            and not isinstance(actual, sa.Text)
            and actual.length == length
        )

    if expected == "datetime":
        if not isinstance(actual, sa.DateTime):
            return False
        # SQLite does not preserve timezone metadata in its DATETIME type.
        return dialect_name == "sqlite" or actual.timezone is True

    return False


def _validate_existing_users_table(bind) -> None:
    """Reject an existing users table that is not the known legacy schema."""

    inspector = sa.inspect(bind)
    expected_columns = {
        "id": False,
        "nus_student_number": False,
        "email": False,
        "display_name": False,
        "password_hash": False,
        "role": False,
        "status": False,
        "created_at": False,
        "updated_at": False,
    }
    columns = {column["name"]: column for column in inspector.get_columns("users")}
    problems = [
        f"missing column {name!r}"
        for name in expected_columns
        if name not in columns
    ]
    problems.extend(
        f"column {name!r} has unexpected nullability"
        for name, nullable in expected_columns.items()
        if name in columns and columns[name]["nullable"] is not nullable
    )

    expected_types = {
        "id": ("uuid", None),
        "nus_student_number": ("string", 9),
        "email": ("string", 254),
        "display_name": ("string", 100),
        "password_hash": ("string", 254),
        "role": ("string", 20),
        "status": ("string", 20),
        "created_at": ("datetime", None),
        "updated_at": ("datetime", None),
    }
    for name, (expected, length) in expected_types.items():
        if name in columns and not _column_type_matches(
            columns[name], expected, length, bind.dialect.name
        ):
            expected_description = expected if length is None else f"{expected}({length})"
            problems.append(
                f"column {name!r} has unexpected type or length; expected {expected_description}"
            )

    primary_key = inspector.get_pk_constraint("users")
    if primary_key.get("constrained_columns") != ["id"]:
        problems.append("primary key must be on id")

    indexes = inspector.get_indexes("users")
    for column in ("nus_student_number", "email"):
        if not any(
            index.get("column_names") == [column] and bool(index.get("unique"))
            for index in indexes
        ):
            problems.append(f"missing unique index on {column!r}")

    checks = {
        constraint.get("name"): " ".join(constraint.get("sqltext", "").split()).lower()
        for constraint in inspector.get_check_constraints("users")
    }
    expected_checks = {
        "ck_users_role": ("role", {"user", "admin"}),
        "ck_users_status": (
            "status",
            {"active", "deactivated", "suspended"},
        ),
    }
    for name, (column, allowed_values) in expected_checks.items():
        if not checks.get(name) or not _check_constraint_matches(
            checks[name], column, allowed_values
        ):
            problems.append(f"missing or incorrect check constraint {name!r}")

    if problems:
        raise RuntimeError(
            "Existing 'users' table does not match the expected legacy schema: "
            + "; ".join(problems)
        )


def upgrade() -> None:
    """Create the initial user-account schema on a fresh database."""

    # The application previously created this schema with
    # Base.metadata.create_all(). Treat that schema as the baseline when
    # upgrading an existing database, while still creating it on a fresh one.
    bind = op.get_bind()
    if sa.inspect(bind).has_table("users"):
        _validate_existing_users_table(bind)
        return

    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("nus_student_number", sa.String(length=9), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("display_name", sa.String(length=100), nullable=False),
        sa.Column("password_hash", sa.String(length=254), nullable=False),
        sa.Column("role", sa.String(length=20), server_default=sa.text("'user'"), nullable=False),
        sa.Column(
            "status", sa.String(length=20), server_default=sa.text("'active'"), nullable=False
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("role IN ('user', 'admin')", name="ck_users_role"),
        sa.CheckConstraint(
            "status IN ('active', 'deactivated', 'suspended')",
            name="ck_users_status",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_nus_student_number", "users", ["nus_student_number"], unique=True)
    op.create_index("ix_users_email", "users", ["email"], unique=True)


def downgrade() -> None:
    """Reject a destructive downgrade that would delete user accounts."""

    raise RuntimeError(
        "Downgrade is unsupported: reverting this migration would delete user accounts."
    )
