# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-28 to 2026-09-29
# Scope: Debugging assistance; Refactoring and documentation improvements — identify metadata drift and align coordinate-index expressions with the migration.
# Author review: Keith confirmed review of all affected changes.
# Details: ../ai/usage-log.md; ai-20260929-001

from datetime import datetime, time
from uuid import UUID, uuid4

from geoalchemy2 import Geography
from geoalchemy2.elements import WKBElement
from sqlalchemy import literal_column, CheckConstraint, Column, DateTime, ForeignKey, func, Index, Integer, SmallInteger, Table, Text, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

supplier_category = Table(
    "supplier_category",
    Base.metadata,
    Column(
        "supplier_id",
        ForeignKey("supplier.id"),
        primary_key=True
    ),
    Column(
        "category_id",
        ForeignKey("category.id", ondelete="RESTRICT"),
        primary_key=True
    ),
)

class Category(Base):
    __tablename__ = "category"

    __table_args__ = (
        CheckConstraint(
            "name ~ '[^[:space:]]'",
            name="ck_category_name_nonblank",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(Text, nullable=False)

class Supplier(Base):
    __tablename__ = "supplier"

    __table_args__ = (
        CheckConstraint(
            "name ~ '[^[:space:]]'",
            name="ck_supplier_name_nonblank",
        ),
        CheckConstraint(
            "version > 0",
            name="ck_supplier_version_positive",
        ),
        CheckConstraint(
            """
            (
                opening_time IS NULL
                AND closing_time IS NULL
                AND closing_day_offset IS NULL
            )
            OR
            (
                opening_time IS NOT NULL
                AND closing_time IS NOT NULL
                AND closing_day_offset IS NOT NULL
                AND closing_day_offset IN (0, 1)
                AND (closing_time - opening_time + closing_day_offset * INTERVAL '1 day') > INTERVAL '0 seconds'
                AND (closing_time - opening_time + closing_day_offset * INTERVAL '1 day') <= INTERVAL '1 day'
            )
            """,
            name="ck_supplier_opening_hours",
        ),
    )

    # UUID primary key; use the same pattern as Category.id
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)

    # Required TEXT columns
    name: Mapped[str] = mapped_column(Text, nullable=False)
    area: Mapped[str] = mapped_column(Text, nullable=False)

    location: Mapped[WKBElement] = mapped_column(
        Geography(
            geometry_type="POINT",
            srid=4326,
            spatial_index=False,
        ),
        nullable=False,
    )

    # Optional TEXT columns
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    building: Mapped[str | None] = mapped_column(Text, nullable=True)
    floor: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_key: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Optional daily times without time zones
    opening_time: Mapped[time | None] = mapped_column(Time(timezone=False), nullable=True)
    closing_time: Mapped[time | None] = mapped_column(Time(timezone=False), nullable=True)

    # Optional SMALLINT
    closing_day_offset: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)

    # Required timestamps with time zones
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Optional timestamp with time zone
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Required INTEGER, initially 1
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    categories: Mapped[list[Category]] = relationship(
        secondary = supplier_category
    )

# Maintain category uniqueness
Index(
    "uq_category_name_ci",
    func.lower(Category.name),
    unique=True,
)

Index(
    "ix_supplier_active_area_name",
    Supplier.area,
    Supplier.name,
    Supplier.id,
    postgresql_where=Supplier.deleted_at.is_(None)  # Include only active suppliers
)

Index(
    "ix_supplier_active_name",
    Supplier.name,
    Supplier.id,
    postgresql_where=Supplier.deleted_at.is_(None)  # Include only active suppliers
)

Index(
    "ix_supplier_category_category_supplier",
    supplier_category.c.category_id,
    supplier_category.c.supplier_id,
)

Index(
    "ix_supplier_location",
    Supplier.location,
    postgresql_using="gist",
)

Index(
    "uq_supplier_active_name_location",
    func.lower(func.btrim(Supplier.name)),  # normalize by trimming then lowercasing
    func.ST_X(literal_column("location::geometry")),   # extract longitude
    func.ST_Y(literal_column("location::geometry")),   # extract latitude
    unique=True,    # require uniqueness
    postgresql_where=Supplier.deleted_at.is_(None), # don't include deleted suppliers
)
