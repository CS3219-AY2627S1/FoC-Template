# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-30, 2026-10-01
# Scope: Writing implementation code; Refactoring and documentation improvements — implement synchronous active detail reads with a safe transport-independent availability exception, preserving programming errors and caller-owned session cleanup.
# Scope: Writing implementation code; Refactoring and documentation improvements — implement default/bounded pagination with shared validation issues before queries and reuse the safe availability boundary for listing and detail reads. (ai-20260930-014)
# Scope: Writing implementation code; Refactoring and documentation improvements — expose controlled categories through the safe availability boundary and immutable approved areas in declared order without database access. (ai-20260930-015)
# Scope: Writing implementation code; Refactoring and documentation improvements — implement the specified service-owned update transaction, explicit editable snapshot and merged validation, presence-aware scalar/category edits, detached post-commit results, fresh conflict classification, and safe database-failure translation without retries. (ai-20261001-006)
# Scope: Writing implementation code; Refactoring and documentation improvements — implement atomic creation with category validation, shared inserts, detached post-commit results, exact duplicate translation, and shared availability classification. (ai-20261001-002)
# Author review: Keith confirmed review of earlier work and the creation implementation (ai-20261001-002).
# Author review: Keith confirmed review of the retained atomic update changes (ai-20261001-006).
# Scope: Writing implementation code; Refactoring and documentation improvements — implement and document the specified single-transaction delete_supplier service, deleted-before-version classification, shared availability failure boundary, SupplierDeleteUnavailable, rollback, and success only after completion without retries. (ai-20261001-010)
# Author review: Keith confirmed review of the retained soft deletion changes (ai-20261001-010).
# Tool: Codex (model: GPT-6), date: 2026-10-01
# Scope: Writing implementation code; Refactoring and documentation improvements — add administrator detail/list services, validate status, extract shared pagination validation, and reuse the safe read failure boundary while keeping ordinary entry points active-only. (ai-20261001-012)
# Author review: Keith confirmed review of the retained administrator-read changes (ai-20261001-012).
# Details: ../../ai/usage-log.md; ai-20260930-013; ai-20260930-014; ai-20260930-015; ai-20261001-002; ai-20261001-006; ai-20261001-010; ai-20261001-012

"""Transport-independent supplier reads and atomic mutations on caller sessions."""

from collections.abc import Iterable, Iterator, Mapping
from contextlib import contextmanager
from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy.exc import DBAPIError, IntegrityError, OperationalError, TimeoutError
from sqlalchemy.orm import Session

from app.repositories.suppliers import (
    CategoryRead, SupplierPage, SupplierRead, find_active_detail, list_active_suppliers,
    insert_category_assignments, insert_supplier, active_supplier_exists,
    replace_category_assignments, update_active_supplier,
    lock_supplier, soft_delete_supplier, SupplierStatus, find_admin_detail,
    list_admin_suppliers as read_admin_suppliers,
    list_categories as read_categories,
)
from app.schemas import SupplierPatch
from app.validation.errors import DomainValidationError, ValidationIssue
from app.validation.suppliers import validate_supplier_create, validate_supplier_patch
from app.validation.vocabulary import APPROVED_AREAS


class SupplierReadUnavailable(Exception):
    """Safe public failure; database diagnostics are not part of the contract."""

    def __init__(self) -> None:
        super().__init__("Supplier details are temporarily unavailable.")


class SupplierDuplicate(Exception):
    """The active normalized name and exact coordinates already exist."""

    def __init__(self) -> None:
        super().__init__("An active supplier with this name and location already exists.")


class SupplierCreateUnavailable(Exception):
    """Safe write failure; a failed commit acknowledgement may be uncertain."""

    def __init__(self) -> None:
        super().__init__("Supplier creation is temporarily unavailable.")


def create_supplier(session: Session, payload: object) -> SupplierRead:
    """Own one transaction on a fresh request session; never retry a write."""
    try:
        with session.begin():
            categories = read_categories(session)
            values = validate_supplier_create(payload, (category.id for category in categories))
            supplier_id = uuid4()
            timestamp = datetime.now(timezone.utc)
            insert_supplier(session, supplier_id, values, timestamp)
            insert_category_assignments(session, supplier_id, tuple(values.category_ids))
            session.flush()
            result = find_active_detail(session, supplier_id)
            if result is None:
                raise RuntimeError("Created supplier could not be loaded.")
        # The detached value is built before commit but exposed only afterward.
        return result
    except TimeoutError:
        raise SupplierCreateUnavailable() from None
    except DBAPIError as error:
        # Translate only after the transaction context has finished cleanup.
        if (isinstance(error, IntegrityError)
                and getattr(error.orig, "sqlstate", None) == "23505"
                and getattr(getattr(error.orig, "diag", None), "constraint_name", None)
                == "uq_supplier_active_name_location"):
            raise SupplierDuplicate() from None
        if _database_unavailable(error):
            raise SupplierCreateUnavailable() from None
        raise


class SupplierNotFound(Exception):
    """The requested supplier is missing or no longer active."""

    def __init__(self) -> None:
        super().__init__("Supplier not found.")


class SupplierVersionConflict(Exception):
    """The active supplier changed since the caller loaded it."""

    def __init__(self) -> None:
        super().__init__("Supplier has changed. Reload before trying again.")


class SupplierUpdateUnavailable(Exception):
    """Safe write failure, including uncertain commit acknowledgement."""

    def __init__(self) -> None:
        super().__init__("Supplier update is temporarily unavailable.")


def update_supplier(
    session: Session, supplier_id: UUID, expected_version: int, payload: object,
) -> SupplierRead:
    """Validate merged edits and compare-and-swap in one owned transaction."""
    if isinstance(payload, SupplierPatch):
        payload = payload.model_dump(exclude_unset=True)
    categories_supplied = isinstance(payload, Mapping) and "category_ids" in payload
    try:
        with session.begin():
            stored = find_active_detail(session, supplier_id, refresh=True)
            if stored is None:
                raise SupplierNotFound()
            snapshot = {
                "name": stored.name, "area": stored.area,
                "category_ids": [category.id for category in stored.categories],
                "description": stored.description, "building": stored.building,
                "floor": stored.floor, "image_key": stored.image_key,
                "opening_time": stored.opening_time, "closing_time": stored.closing_time,
            }
            categories = read_categories(session)
            values = validate_supplier_patch(
                payload, snapshot, (category.id for category in categories),
            )
            scalars = values.model_dump(exclude={"category_ids", "closing_day_offset"})
            scalars = {key: value for key, value in scalars.items() if key in payload}
            if "opening_time" in payload or "closing_time" in payload:
                scalars["closing_day_offset"] = values.closing_day_offset
            if not update_active_supplier(
                session, supplier_id, expected_version, scalars, datetime.now(timezone.utc),
            ):
                if not active_supplier_exists(session, supplier_id):
                    raise SupplierNotFound()
                raise SupplierVersionConflict()
            if categories_supplied:
                replace_category_assignments(session, supplier_id, tuple(values.category_ids))
            session.flush()
            result = find_active_detail(session, supplier_id, refresh=True)
            if result is None:
                raise RuntimeError("Updated supplier could not be loaded.")
        return result
    except TimeoutError:
        raise SupplierUpdateUnavailable() from None
    except DBAPIError as error:
        if (isinstance(error, IntegrityError)
                and getattr(error.orig, "sqlstate", None) == "23505"
                and getattr(getattr(error.orig, "diag", None), "constraint_name", None)
                == "uq_supplier_active_name_location"):
            raise SupplierDuplicate() from None
        if _database_unavailable(error):
            raise SupplierUpdateUnavailable() from None
        raise


class SupplierDeleteUnavailable(Exception):
    """Safe write failure, including uncertain commit acknowledgement."""

    def __init__(self) -> None:
        super().__init__("Supplier deletion is temporarily unavailable.")


def delete_supplier(session: Session, supplier_id: UUID, expected_version: int) -> None:
    """Soft-delete in one transaction on a fresh caller session; never retry."""
    try:
        with session.begin():
            stored = lock_supplier(session, supplier_id)
            if stored is None:
                raise SupplierNotFound()
            if stored.deleted_at is None:
                if stored.version != expected_version:
                    raise SupplierVersionConflict()
                soft_delete_supplier(session, stored, datetime.now(timezone.utc))
                session.flush()
        # Even an idempotent success is exposed only after transaction completion.
    except TimeoutError:
        raise SupplierDeleteUnavailable() from None
    except DBAPIError as error:
        if _database_unavailable(error):
            raise SupplierDeleteUnavailable() from None
        raise


def get_supplier(session: Session, supplier_id: UUID) -> SupplierRead | None:
    """Return active details or None; leave transaction cleanup to the caller."""
    with _read_failure_boundary():
        return find_active_detail(session, supplier_id)


def list_categories(session: Session) -> tuple[CategoryRead, ...]:
    """Return all controlled category choices, including unassigned categories."""
    with _read_failure_boundary():
        return read_categories(session)


def list_areas() -> tuple[str, ...]:
    """Return immutable approved choices in declared order without database access."""
    return APPROVED_AREAS


@contextmanager
def _read_failure_boundary() -> Iterator[None]:
    try:
        yield
    except TimeoutError:
        raise SupplierReadUnavailable() from None
    except DBAPIError as error:
        if not _database_unavailable(error):
            raise
        raise SupplierReadUnavailable() from None


def _database_unavailable(error: DBAPIError) -> bool:
    state = getattr(error.orig, "sqlstate", None)
    # Class 08 is a connection failure; class 53 is resource exhaustion.
    # Psycopg connection failures can have no server SQLSTATE at all.
    return (
        error.connection_invalidated
        or (state is not None and (state.startswith(("08", "53"))
                                  or state in {"57P01", "57P02", "57P03"}))
        or (isinstance(error, OperationalError) and state is None)
    )


def list_suppliers(
    session: Session, *, area: str | None = None,
    category_ids: Iterable[UUID] = (), limit: int = 20, offset: int = 0,
) -> SupplierPage:
    """Validate pagination before querying; UUID parsing belongs to adapters."""
    _validate_pagination(limit, offset)
    with _read_failure_boundary():
        return list_active_suppliers(
            session, area=area, category_ids=category_ids, limit=limit, offset=offset,
        )


def get_admin_supplier(session: Session, supplier_id: UUID) -> SupplierRead | None:
    """Return retained details in either deletion state."""
    with _read_failure_boundary():
        return find_admin_detail(session, supplier_id)


def list_admin_suppliers(
    session: Session, *, status: SupplierStatus = "active", area: str | None = None,
    category_ids: Iterable[UUID] = (), limit: int = 20, offset: int = 0,
) -> SupplierPage:
    """Validate administrator filters before reading through the safe boundary."""
    if status not in ("active", "deleted", "all"):
        raise DomainValidationError([ValidationIssue(
            ("query.status",), "INVALID_INPUT", "Status must be active, deleted, or all.",
        )])
    _validate_pagination(limit, offset)
    with _read_failure_boundary():
        return read_admin_suppliers(
            session, status=status, area=area, category_ids=category_ids,
            limit=limit, offset=offset,
        )


def _validate_pagination(limit: int, offset: int) -> None:
    issues = []
    if type(limit) is not int or not 1 <= limit <= 100:
        issues.append(ValidationIssue(
            ("query.limit",), "INVALID_PAGINATION", "Limit must be an integer from 1 to 100.",
        ))
    if type(offset) is not int or offset < 0:
        issues.append(ValidationIssue(
            ("query.offset",), "INVALID_PAGINATION", "Offset must be a nonnegative integer.",
        ))
    if issues:
        raise DomainValidationError(issues)
