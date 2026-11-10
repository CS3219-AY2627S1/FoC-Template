# AI Assistance Disclosure (hwangjihun):
# Tool: ChatGPT (Codex, model: gpt-6-sol), date: 2026-09-23, 2026-09-24
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-21
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-02
# Scope: Generated Supplier CRUD queries and refined listing/search SQL and connection reuse.
# Author review: I validated correctness, and added boundary checks.

"""Supplier-owned PostgreSQL writes. Supabase migrations own the schema."""

from typing import Annotated, Literal
from uuid import UUID

import psycopg
from fastapi import Depends
from psycopg import sql
from pydantic import ValidationError

from app.config import Settings, get_settings
from app.database import get_pool
from app.errors import ApiError, validation_fields
from app.schemas import (
    CategoryResponse,
    SupplierCreate,
    SupplierListFilters,
    SupplierListItem,
    SupplierListResponse,
    SupplierPatch,
    SupplierRemovalResponse,
    SupplierResponse,
)

SUPPLIER_COLUMNS = (
    "name",
    "building_area",
    "pickup_location_description",
    "floor",
    "latitude",
    "longitude",
    "opening_time",
    "closing_time",
    "image_url",
    "status",
)


def _check_categories(
    cursor: psycopg.Cursor, categories: list[str], *, field: str = "categories"
) -> None:
    cursor.execute(
        "SELECT code FROM supplier_service.categories WHERE code = ANY(%s)",
        (categories,),
    )
    supported = {row["code"] for row in cursor.fetchall()}
    unknown = sorted(set(categories) - supported)
    if unknown:
        raise ApiError(
            422,
            "VALIDATION_ERROR",
            "Supplier data is invalid",
            [{"field": field, "message": f"Unsupported category: {code}"} for code in unknown],
        )


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _response(row: dict, categories: list[str]) -> SupplierResponse:
    result = dict(row)
    result["categories"] = categories
    for column in ("opening_time", "closing_time"):
        result[column] = row[column].strftime("%H:%M") if row[column] else None
    return SupplierResponse.model_validate(result)


def _list_item(row: dict) -> SupplierListItem:
    result = dict(row)
    for column in ("opening_time", "closing_time"):
        result[column] = row[column].strftime("%H:%M") if row[column] else None
    return SupplierListItem.model_validate(result)


class SupplierRepository:
    def __init__(self, database_url: str) -> None:
        self.database_url = database_url

    def _connection(self):
        # Pool timeouts and broken connections raise psycopg.Error, which
        # each method already reports as 503 DATABASE_UNAVAILABLE.
        return get_pool(self.database_url).connection()

    def list_categories(self) -> list[CategoryResponse]:
        if not self.database_url:
            raise ApiError(503, "DATABASE_UNAVAILABLE", "Supplier database is unavailable")
        try:
            with (
                self._connection() as conn,
                conn.cursor() as cursor,
            ):
                cursor.execute(
                    "SELECT code, display_name FROM supplier_service.categories "
                    "ORDER BY display_name, code"
                )
                rows = cursor.fetchall()
            return [CategoryResponse.model_validate(row) for row in rows]
        except psycopg.Error as error:
            raise ApiError(
                503, "DATABASE_UNAVAILABLE", "Supplier database is unavailable"
            ) from error

    def list_active_suppliers(self, filters: SupplierListFilters) -> SupplierListResponse:
        return self._list_suppliers(filters, status="ACTIVE")

    def list_admin_suppliers(
        self, filters: SupplierListFilters, status: Literal["ACTIVE", "INACTIVE"] | None
    ) -> SupplierListResponse:
        return self._list_suppliers(filters, status=status)

    def _list_suppliers(
        self, filters: SupplierListFilters, status: Literal["ACTIVE", "INACTIVE"] | None
    ) -> SupplierListResponse:
        if not self.database_url:
            raise ApiError(503, "DATABASE_UNAVAILABLE", "Supplier database is unavailable")
        try:
            with (
                self._connection() as conn,
                conn.cursor() as cursor,
            ):
                clauses = []
                parameters: list[object] = []
                if status is not None:
                    clauses.append(sql.SQL("s.status = %s::supplier_service.supplier_status"))
                    parameters.append(status)
                term = filters.q.strip() if filters.q else ""
                if term:
                    # ILIKE lets the trigram indexes serve the search; escape
                    # LIKE wildcards so the term stays a literal substring.
                    pattern = "%" + _escape_like(term) + "%"
                    clauses.append(
                        sql.SQL(
                            "(s.name ILIKE %s OR s.building_area ILIKE %s OR "
                            "s.pickup_location_description ILIKE %s)"
                        )
                    )
                    parameters.extend((pattern, pattern, pattern))
                if filters.categories:
                    _check_categories(cursor, filters.categories, field="category")
                    clauses.append(
                        sql.SQL(
                            "EXISTS (SELECT 1 FROM supplier_service.supplier_categories sc "
                            "WHERE sc.supplier_id = s.id AND sc.category_code = ANY(%s))"
                        )
                    )
                    parameters.append(sorted(set(filters.categories)))
                where_sql = sql.SQL(" AND ").join(clauses) if clauses else sql.SQL("TRUE")
                cursor.execute(
                    sql.SQL(
                        "SELECT count(*) AS total FROM supplier_service.suppliers s WHERE {}"
                    ).format(where_sql),
                    parameters,
                )
                total = cursor.fetchone()["total"]
                # The id tie-breaker follows the name direction so one
                # (lower(name), id) index serves both sort orders.
                direction = sql.SQL("ASC" if filters.sort == "asc" else "DESC")
                cursor.execute(
                    sql.SQL(
                        "SELECT s.id, s.name, s.building_area, s.floor, s.status, "
                        "s.opening_time, s.closing_time, "
                        "ARRAY(SELECT sc.category_code "
                        "FROM supplier_service.supplier_categories sc "
                        "WHERE sc.supplier_id = s.id ORDER BY sc.category_code) AS categories "
                        "FROM supplier_service.suppliers s WHERE {} "
                        "ORDER BY lower(s.name) {}, s.id {} LIMIT %s OFFSET %s"
                    ).format(where_sql, direction, direction),
                    (*parameters, filters.page_size, (filters.page - 1) * filters.page_size),
                )
                rows = cursor.fetchall()
            return SupplierListResponse(
                items=[_list_item(row) for row in rows],
                page=filters.page,
                page_size=filters.page_size,
                total=total,
            )
        except psycopg.Error as error:
            raise ApiError(
                503, "DATABASE_UNAVAILABLE", "Supplier database is unavailable"
            ) from error

    def get_active_supplier(self, supplier_id: UUID) -> SupplierResponse:
        return self._get_supplier(supplier_id, include_inactive=False)

    def get_admin_supplier(self, supplier_id: UUID) -> SupplierResponse:
        return self._get_supplier(supplier_id, include_inactive=True)

    def _get_supplier(self, supplier_id: UUID, *, include_inactive: bool) -> SupplierResponse:
        if not self.database_url:
            raise ApiError(503, "DATABASE_UNAVAILABLE", "Supplier database is unavailable")
        try:
            with (
                self._connection() as conn,
                conn.cursor() as cursor,
            ):
                active_predicate = (
                    sql.SQL("") if include_inactive else sql.SQL(" AND status = 'ACTIVE'")
                )
                cursor.execute(
                    sql.SQL("SELECT * FROM supplier_service.suppliers WHERE id = %s{}").format(
                        active_predicate
                    ),
                    (supplier_id,),
                )
                row = cursor.fetchone()
                if row is None:
                    raise ApiError(404, "SUPPLIER_NOT_FOUND", "Supplier not found")
                cursor.execute(
                    "SELECT category_code FROM supplier_service.supplier_categories "
                    "WHERE supplier_id = %s ORDER BY category_code",
                    (supplier_id,),
                )
                categories = [item["category_code"] for item in cursor.fetchall()]
            return _response(row, categories)
        except psycopg.Error as error:
            raise ApiError(
                503, "DATABASE_UNAVAILABLE", "Supplier database is unavailable"
            ) from error

    def create(self, supplier: SupplierCreate) -> SupplierResponse:
        if not self.database_url:
            raise ApiError(503, "DATABASE_UNAVAILABLE", "Supplier database is unavailable")
        try:
            # The pooled connection context commits only after all inserts and
            # the deferred category trigger succeed; errors roll everything back.
            with self._connection() as conn:
                with conn.cursor() as cursor:
                    _check_categories(cursor, supplier.categories)

                    cursor.execute(
                        """
                        INSERT INTO supplier_service.suppliers (
                            name, building_area, pickup_location_description,
                            floor, latitude, longitude, opening_time, closing_time,
                            image_url, status
                        ) VALUES (
                            %s, %s, %s, %s, %s, %s, %s::time, %s::time,
                            %s, %s::supplier_service.supplier_status
                        ) RETURNING id
                        """,
                        (
                            supplier.name,
                            supplier.building_area,
                            supplier.pickup_location_description,
                            supplier.floor,
                            supplier.latitude,
                            supplier.longitude,
                            supplier.opening_time,
                            supplier.closing_time,
                            str(supplier.image_url) if supplier.image_url is not None else None,
                            supplier.status,
                        ),
                    )
                    supplier_id = cursor.fetchone()["id"]
                    cursor.executemany(
                        """
                        INSERT INTO supplier_service.supplier_categories (
                            supplier_id, category_code
                        )
                        VALUES (%s, %s)
                        """,
                        [(supplier_id, code) for code in supplier.categories],
                    )
                    cursor.execute(
                        "SELECT * FROM supplier_service.suppliers WHERE id = %s",
                        (supplier_id,),
                    )
                    row = cursor.fetchone()

            # Reaching here means the transaction, including deferred checks,
            # committed successfully.
            return _response(row, supplier.categories)
        except psycopg.errors.UniqueViolation as error:
            raise ApiError(
                409,
                "DUPLICATE_SUPPLIER",
                "A supplier with this name, area, and floor already exists",
            ) from error
        except (psycopg.errors.CheckViolation, psycopg.errors.ForeignKeyViolation) as error:
            raise ApiError(422, "VALIDATION_ERROR", "Supplier data is invalid") from error
        except psycopg.Error as error:
            raise ApiError(
                503, "DATABASE_UNAVAILABLE", "Supplier database is unavailable"
            ) from error

    def update(self, supplier_id: UUID, patch: SupplierPatch) -> SupplierResponse:
        if not self.database_url:
            raise ApiError(503, "DATABASE_UNAVAILABLE", "Supplier database is unavailable")
        try:
            with self._connection() as conn:
                with conn.cursor() as cursor:
                    cursor.execute(
                        "SELECT * FROM supplier_service.suppliers WHERE id = %s FOR UPDATE",
                        (supplier_id,),
                    )
                    current_row = cursor.fetchone()
                    if current_row is None:
                        raise ApiError(404, "SUPPLIER_NOT_FOUND", "Supplier not found")

                    cursor.execute(
                        "SELECT category_code FROM supplier_service.supplier_categories "
                        "WHERE supplier_id = %s ORDER BY category_code",
                        (supplier_id,),
                    )
                    current_categories = [row["category_code"] for row in cursor.fetchall()]
                    current_data = {column: current_row[column] for column in SUPPLIER_COLUMNS}
                    for column in ("opening_time", "closing_time"):
                        value = current_data[column]
                        if value is None:
                            current_data[column] = None
                        elif value.second or value.microsecond:
                            current_data[column] = value.isoformat()
                        else:
                            current_data[column] = value.strftime("%H:%M")
                    current_data["categories"] = current_categories
                    changes = patch.model_dump(mode="json", exclude_unset=True)
                    try:
                        updated = SupplierCreate.model_validate(current_data | changes)
                    except ValidationError as error:
                        raise ApiError(
                            422,
                            "VALIDATION_ERROR",
                            "Supplier data is invalid",
                            validation_fields(error.errors()),
                        ) from error
                    _check_categories(cursor, updated.categories)

                    assignments = []
                    parameters = []
                    for column in SUPPLIER_COLUMNS:
                        if column not in changes:
                            continue
                        cast = (
                            "::time"
                            if column in ("opening_time", "closing_time")
                            else "::supplier_service.supplier_status"
                            if column == "status"
                            else ""
                        )
                        assignments.append(
                            sql.SQL("{} = %s{}").format(sql.Identifier(column), sql.SQL(cast))
                        )
                        value = getattr(updated, column)
                        parameters.append(
                            str(value) if column == "image_url" and value is not None else value
                        )
                    if assignments:
                        cursor.execute(
                            sql.SQL(
                                "UPDATE supplier_service.suppliers SET {} WHERE id = %s"
                            ).format(sql.SQL(", ").join(assignments)),
                            (*parameters, supplier_id),
                        )

                    if "categories" in changes and set(updated.categories) != set(
                        current_categories
                    ):
                        cursor.execute(
                            "DELETE FROM supplier_service.supplier_categories "
                            "WHERE supplier_id = %s",
                            (supplier_id,),
                        )
                        cursor.executemany(
                            "INSERT INTO supplier_service.supplier_categories "
                            "(supplier_id, category_code) "
                            "VALUES (%s, %s)",
                            [(supplier_id, code) for code in updated.categories],
                        )

                    cursor.execute(
                        "SELECT * FROM supplier_service.suppliers WHERE id = %s", (supplier_id,)
                    )
                    row = cursor.fetchone()
                    cursor.execute(
                        "SELECT category_code FROM supplier_service.supplier_categories "
                        "WHERE supplier_id = %s ORDER BY category_code",
                        (supplier_id,),
                    )
                    categories = [item["category_code"] for item in cursor.fetchall()]

            return _response(row, categories)
        except psycopg.errors.UniqueViolation as error:
            raise ApiError(
                409,
                "DUPLICATE_SUPPLIER",
                "A supplier with this name, area, and floor already exists",
            ) from error
        except (psycopg.errors.CheckViolation, psycopg.errors.ForeignKeyViolation) as error:
            raise ApiError(422, "VALIDATION_ERROR", "Supplier data is invalid") from error
        except psycopg.Error as error:
            raise ApiError(
                503, "DATABASE_UNAVAILABLE", "Supplier database is unavailable"
            ) from error

    def deactivate(self, supplier_id: UUID) -> SupplierRemovalResponse:
        """Retain the row until Errand Service can prove hard deletion is safe."""
        if not self.database_url:
            raise ApiError(503, "DATABASE_UNAVAILABLE", "Supplier database is unavailable")
        try:
            with self._connection() as conn:
                with conn.cursor() as cursor:
                    cursor.execute(
                        "SELECT status FROM supplier_service.suppliers WHERE id = %s FOR UPDATE",
                        (supplier_id,),
                    )
                    row = cursor.fetchone()
                    if row is None:
                        raise ApiError(404, "SUPPLIER_NOT_FOUND", "Supplier not found")
                    if row["status"] != "INACTIVE":
                        cursor.execute(
                            "UPDATE supplier_service.suppliers SET status = 'INACTIVE' "
                            "WHERE id = %s",
                            (supplier_id,),
                        )

            return SupplierRemovalResponse(id=supplier_id, outcome="DEACTIVATED")
        except psycopg.Error as error:
            raise ApiError(
                503, "DATABASE_UNAVAILABLE", "Supplier database is unavailable"
            ) from error


def get_repository(settings: Annotated[Settings, Depends(get_settings)]) -> SupplierRepository:
    return SupplierRepository(settings.database_url)
