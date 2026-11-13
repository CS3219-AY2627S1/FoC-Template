# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-30, 2026-10-01
# Scope: Writing implementation code — implement category resolution, active/deleted UUID lookup, and PostgreSQL index-aligned active-duplicate queries with autoflush disabled.
# Scope: Writing implementation code; Refactoring and documentation improvements — add supplier and category-assignment insertion helpers using bound longitude-first SRID 4326 points, normalized values, aware timestamps, version 1, and null deletion state while leaving transaction ownership in the service.
# Scope: Writing implementation code; Refactoring and documentation improvements — implement active-only detail lookup, immutable supplier/category values, named PostGIS coordinates, and eager categories with caller-owned transactions. (ai-20260930-013)
# Scope: Writing implementation code; Refactoring and documentation improvements — implement active filtered pages and matching totals with name/UUID ordering, and share coordinate projection, select-in categories, and immutable mapping with detail reads. (ai-20260930-014)
# Scope: Writing implementation code; Refactoring and documentation improvements — implement direct ordered category ID/name retrieval as immutable values, independent of supplier assignments and without autoflush. (ai-20260930-015)
# Scope: Writing implementation code; Refactoring and documentation improvements — accept cleaned seed/create results, exclude category IDs from supplier inserts, and clarify separate assignments. (ai-20261001-001)
# Scope: Writing implementation code; Refactoring and documentation improvements — implement conditional active/version SQL updates with RETURNING, atomic version/timestamp changes, direct active-state queries, assignment replacement, and optional refreshed scalar/relationship loading while retaining service transaction ownership. (ai-20261001-006)
# Author review: Keith confirmed review of the retained atomic update changes (ai-20261001-006).
# Scope: Writing implementation code; Refactoring and documentation improvements — implement and document SELECT FOR UPDATE lookup including deleted rows with populate_existing refresh, plus timestamp and version changes on the locked row within the service-owned transaction. (ai-20261001-010)
# Author review: Keith confirmed review of the retained soft deletion changes (ai-20261001-010).
# Tool: Codex (model: GPT-6), date: 2026-10-01
# Scope: Writing implementation code; Refactoring and documentation improvements — add separate administrator detail/list entry points, a status Literal, and shared status/area/category predicates before count and pagination while preserving immutable values, category matching, ordering, and active-only ordinary reads. (ai-20261001-012)
# Author review: Keith confirmed review of the retained administrator-read changes (ai-20261001-012).
# Details: ../../ai/usage-log.md; ai-20260930-009; ai-20260930-010; ai-20260930-013; ai-20260930-014; ai-20260930-015; ai-20261001-001; ai-20261001-006; ai-20261001-010; ai-20261001-012

"""Supplier persistence; transaction ownership stays with the service."""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, time
from typing import Literal
from uuid import UUID

from geoalchemy2 import Geography, Geometry
from sqlalchemy import cast, delete, func, insert, literal_column, select, update
from sqlalchemy.orm import Session, selectinload

from app.models import Category, Supplier, supplier_category
from app.schemas import SupplierCreateResult, SupplierSeedResult


# Keep these expressions aligned with uq_supplier_active_name_location.
_LONGITUDE = func.ST_X(literal_column("location::geometry"))
_LATITUDE = func.ST_Y(literal_column("location::geometry"))


def normalized_name(expression):
    """PostgreSQL normalization used by the active duplicate index."""
    return func.lower(func.btrim(expression))


@dataclass(frozen=True)
class SupplierIdentity:
    supplier_id: UUID
    longitude: float
    latitude: float


@dataclass(frozen=True)
class CategoryRead:
    id: UUID
    name: str


@dataclass(frozen=True)
class SupplierRead:
    """Detached detail value; accessing fields never requires a session."""

    id: UUID
    name: str
    area: str
    description: str | None
    building: str | None
    floor: str | None
    image_key: str | None
    opening_time: time | None
    closing_time: time | None
    closing_day_offset: int | None
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None
    version: int
    latitude: float
    longitude: float
    categories: tuple[CategoryRead, ...]


@dataclass(frozen=True)
class SupplierPage:
    items: tuple[SupplierRead, ...]
    total: int
    limit: int
    offset: int


def _read_statement():
    """Project coordinates together with suppliers and batch-load categories."""
    point = cast(Supplier.location, Geometry("POINT", srid=4326))
    return select(
        Supplier,
        func.ST_Y(point).label("latitude"),
        func.ST_X(point).label("longitude"),
    ).options(selectinload(Supplier.categories))


def _read_value(supplier: Supplier, latitude: float, longitude: float) -> SupplierRead:
    return SupplierRead(
        id=supplier.id, name=supplier.name, area=supplier.area,
        description=supplier.description, building=supplier.building,
        floor=supplier.floor, image_key=supplier.image_key,
        opening_time=supplier.opening_time, closing_time=supplier.closing_time,
        closing_day_offset=supplier.closing_day_offset,
        created_at=supplier.created_at, updated_at=supplier.updated_at,
        deleted_at=supplier.deleted_at, version=supplier.version,
        latitude=latitude, longitude=longitude,
        categories=tuple(sorted(
            (CategoryRead(category.id, category.name) for category in supplier.categories),
            key=lambda category: (category.name, category.id),
        )),
    )


def find_active_detail(
    session: Session, supplier_id: UUID, *, refresh: bool = False,
) -> SupplierRead | None:
    """Read an active identity without flushing or owning the transaction."""
    statement = _read_statement().where(
        Supplier.id == supplier_id, Supplier.deleted_at.is_(None),
    )
    if refresh:
        statement = statement.execution_options(populate_existing=True)
    with session.no_autoflush:
        row = session.execute(statement).one_or_none()
        return _read_value(*row) if row is not None else None


SupplierStatus = Literal["active", "deleted", "all"]


def find_admin_detail(session: Session, supplier_id: UUID) -> SupplierRead | None:
    """Read either deletion state without flushing or owning the transaction."""
    with session.no_autoflush:
        row = session.execute(_read_statement().where(Supplier.id == supplier_id)).one_or_none()
        return _read_value(*row) if row is not None else None


def list_active_suppliers(
    session: Session, *, area: str | None = None,
    category_ids: Iterable[UUID] = (), limit: int, offset: int,
) -> SupplierPage:
    return _list_suppliers(
        session, status="active", area=area, category_ids=category_ids,
        limit=limit, offset=offset,
    )


def list_admin_suppliers(
    session: Session, *, status: SupplierStatus = "active", area: str | None = None,
    category_ids: Iterable[UUID] = (), limit: int, offset: int,
) -> SupplierPage:
    return _list_suppliers(
        session, status=status, area=area, category_ids=category_ids,
        limit=limit, offset=offset,
    )


def _list_suppliers(
    session: Session, *, status: SupplierStatus, area: str | None = None,
    category_ids: Iterable[UUID] = (), limit: int, offset: int,
) -> SupplierPage:
    """Count and page identical predicates; pagination is validated by the service."""
    if status not in ("active", "deleted", "all"):
        raise ValueError("Unsupported supplier status.")
    predicates = []
    if status == "active":
        predicates.append(Supplier.deleted_at.is_(None))
    elif status == "deleted":
        predicates.append(Supplier.deleted_at.is_not(None))
    if area is not None:
        predicates.append(Supplier.area == area)
    selected = tuple(set(category_ids))
    if selected:
        predicates.append(Supplier.categories.any(Category.id.in_(selected)))
    statement = _read_statement().where(*predicates).order_by(
        Supplier.name, Supplier.id,
    ).offset(offset).limit(limit)
    with session.no_autoflush:
        total = session.scalar(select(func.count()).select_from(Supplier).where(*predicates))
        items = tuple(_read_value(*row) for row in session.execute(statement))
    return SupplierPage(items=items, total=total, limit=limit, offset=offset)


def list_categories(session: Session) -> tuple[CategoryRead, ...]:
    """Read all migration-managed choices, independent of supplier assignments."""
    with session.no_autoflush:
        return tuple(CategoryRead(*row) for row in session.execute(
            select(Category.id, Category.name).order_by(Category.name, Category.id)
        ))


def resolve_category_ids(session: Session, names: Iterable[str]) -> dict[str, UUID]:
    """Return existing controlled definitions; absent names remain absent."""
    with session.no_autoflush:
        return dict(session.execute(
            select(Category.name, Category.id).where(Category.name.in_(tuple(names)))
        ).all())


def find_identity(session: Session, supplier_id: UUID) -> SupplierIdentity | None:
    """Find immutable coordinates, including for deleted identities."""
    with session.no_autoflush:
        row = session.execute(select(Supplier.id, _LONGITUDE, _LATITUDE).where(
            Supplier.id == supplier_id
        )).one_or_none()
    return SupplierIdentity(*row) if row is not None else None


def duplicate_key(session: Session, name: str, longitude: float, latitude: float):
    """Normalize batch candidates in the database, using its case/space rules."""
    with session.no_autoflush:
        name = session.scalar(select(normalized_name(name)))
    return name, float(longitude), float(latitude)


def find_active_duplicates(
    session: Session, name: str, longitude: float, latitude: float,
) -> tuple[UUID, ...]:
    """Match the partial unique index exactly, without proximity or rounding."""
    with session.no_autoflush:
        return tuple(session.scalars(select(Supplier.id).where(
            Supplier.deleted_at.is_(None),
            normalized_name(Supplier.name) == normalized_name(name),
            _LONGITUDE == float(longitude),
            _LATITUDE == float(latitude),
        ).order_by(Supplier.id)))


def insert_supplier(
    session: Session, supplier_id: UUID, values: SupplierSeedResult | SupplierCreateResult,
    timestamp: datetime,
) -> None:
    """Insert scalar values and a bound point; assignments stay separate."""
    scalars = values.model_dump(exclude={"location", "category_ids"})
    point = cast(func.ST_SetSRID(func.ST_MakePoint(
        float(values.location.longitude), float(values.location.latitude),
    ), 4326), Geography(geometry_type="POINT", srid=4326))
    session.execute(insert(Supplier.__table__).values(
        **scalars, id=supplier_id, location=point,
        created_at=timestamp, updated_at=timestamp, version=1, deleted_at=None,
    ))


def insert_category_assignments(
    session: Session, supplier_id: UUID, category_ids: tuple[UUID, ...],
) -> None:
    """Insert all resolved assignments in the service's existing transaction."""
    if category_ids:
        session.execute(insert(supplier_category), [
            {"supplier_id": supplier_id, "category_id": category_id}
            for category_id in category_ids
        ])


def update_active_supplier(
    session: Session, supplier_id: UUID, expected_version: int,
    scalars: dict[str, object], timestamp: datetime,
) -> bool:
    """Atomically compare version and active state; never own the transaction."""
    table = Supplier.__table__
    statement = update(table).where(
        table.c.id == supplier_id, table.c.version == expected_version,
        table.c.deleted_at.is_(None),
    ).values(**scalars, version=table.c.version + 1, updated_at=timestamp).returning(table.c.id)
    return session.execute(statement).scalar_one_or_none() is not None


def active_supplier_exists(session: Session, supplier_id: UUID) -> bool:
    """Query database state directly, independently of the ORM identity map."""
    with session.no_autoflush:
        return session.scalar(select(Supplier.id).where(
            Supplier.id == supplier_id, Supplier.deleted_at.is_(None),
        )) is not None


def lock_supplier(session: Session, supplier_id: UUID) -> Supplier | None:
    """Lock even deleted rows and refresh state after competing writes finish."""
    with session.no_autoflush:
        return session.scalar(select(Supplier).where(
            Supplier.id == supplier_id,
        ).with_for_update().execution_options(populate_existing=True))


def soft_delete_supplier(session: Session, supplier: Supplier, timestamp: datetime) -> None:
    """Mark a locked active row deleted within the service-owned transaction."""
    supplier.deleted_at = timestamp
    supplier.updated_at = timestamp
    supplier.version += 1


def replace_category_assignments(
    session: Session, supplier_id: UUID, category_ids: tuple[UUID, ...],
) -> None:
    """Replace assignments only after the service's conditional write succeeds."""
    session.execute(delete(supplier_category).where(
        supplier_category.c.supplier_id == supplier_id,
    ))
    insert_category_assignments(session, supplier_id, category_ids)
