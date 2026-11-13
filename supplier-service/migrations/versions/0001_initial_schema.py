# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-28 to 2026-09-29
# Scope: Requirements work; Learning support; Writing implementation code — create PostGIS tables, constraints, indexes, and downgrade behavior from the agreed schema requirements.
# Author review: Keith confirmed review of all affected changes.
# Details: ../../ai/usage-log.md; ai-20260929-001

from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geography

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enable the PostGIS extension before creating geography columns
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    op.create_table(
        "category",
        sa.Column("id", sa.UUID(), primary_key=True),  # "id": UUID primary key
        sa.Column("name", sa.Text(), nullable=False),  # "name": required TEXT

        sa.CheckConstraint("name ~ '[^[:space:]]'", name="ck_category_name_nonblank"),  # Reject blank names
    )

    op.create_index("uq_category_name_ci", "category", [sa.text("lower(name)")], unique=True)

    op.create_table(
        "supplier",
        sa.Column("id", sa.UUID(), primary_key=True),  # "id": UUID primary key
        sa.Column("name", sa.Text(), nullable=False),  # "name": required TEXT
        sa.Column("area", sa.Text(), nullable=False),  # "area": required TEXT
        sa.Column("location", Geography(geometry_type="POINT", srid=4326, spatial_index=False), nullable=False),  # "location": required geographic point
        sa.Column("description", sa.Text(), nullable=True),  # "description": optional TEXT
        sa.Column("building", sa.Text(), nullable=True),  # "building": optional TEXT
        sa.Column("floor", sa.Text(), nullable=True),  # "floor": optional TEXT
        sa.Column("image_key", sa.Text(), nullable=True),  # "image_key": optional TEXT
        sa.Column("opening_time", sa.Time(timezone=False), nullable=True),  # "opening_time": optional TIME without time zone
        sa.Column("closing_time", sa.Time(timezone=False), nullable=True),  # "closing_time": optional TIME without time zone
        sa.Column("closing_day_offset", sa.SmallInteger, nullable=True),  # "closing_day_offset": optional SMALLINT
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),  # "created_at": required timestamp with time zone
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),  # "updated_at": required timestamp with time zone
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),  # "deleted_at": optional timestamp with time zone
        sa.Column("version", sa.Integer, nullable=False),  # "version": required INTEGER

        sa.CheckConstraint("name ~ '[^[:space:]]'", name="ck_supplier_name_nonblank"),  # Reject blank names

        sa.CheckConstraint("version > 0", name="ck_supplier_version_positive"),  # Require a positive version

        sa.CheckConstraint(  # Require absent hours or a complete schedule lasting > 0 and <= 24 hours
            """
            (
                opening_time IS NULL
                AND closing_time is null
                AND closing_day_offset is null
            )
            OR
            (
                opening_time IS NOT NULL
                AND closing_time is not null
                AND closing_day_offset is not null
                AND closing_day_offset IN (0, 1)
                AND (closing_time - opening_time + closing_day_offset * INTERVAL '1 day') > INTERVAL '0 seconds'
                AND (closing_time - opening_time + closing_day_offset * INTERVAL '1 day') <= INTERVAL '1 day'
            )
            """,
            name="ck_supplier_opening_hours",
        ),
    )

    op.create_index("ix_supplier_active_area_name", "supplier", ["area", "name", "id"], postgresql_where=sa.text("deleted_at IS NULL"))

    op.create_index("ix_supplier_active_name", "supplier", ["name", "id"], postgresql_where=sa.text("deleted_at IS NULL"))

    op.create_index("ix_supplier_location", "supplier", ["location"], postgresql_using="gist")

    op.create_index(
        "uq_supplier_active_name_location",
        "supplier",
        [
            sa.text("lower(btrim(name))"),
            sa.text("ST_X(location::geometry)"),
            sa.text("ST_Y(location::geometry)"),
        ],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    op.create_table(
        "supplier_category",
        sa.Column("supplier_id", sa.UUID(), nullable=False),  # "supplier_id": required UUID
        sa.Column("category_id", sa.UUID(), nullable=False),  # "category_id": required UUID
        sa.PrimaryKeyConstraint("supplier_id", "category_id"),  # Prevent duplicate assignments
        sa.ForeignKeyConstraint(["supplier_id"], ["supplier.id"]),  # Require an existing supplier
        sa.ForeignKeyConstraint(["category_id"], ["category.id"], ondelete="RESTRICT"),  # Require an existing category and block deletion while referenced

    )

    op.create_index("ix_supplier_category_category_supplier", "supplier_category", ["category_id", "supplier_id"])

def downgrade() -> None:
    op.drop_table("supplier_category")
    op.drop_table("supplier")
    op.drop_table("category")
