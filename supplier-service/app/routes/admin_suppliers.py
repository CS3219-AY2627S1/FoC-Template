# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-10-01
# Scope: Writing implementation code; Refactoring and documentation improvements — implement the specified DELETE adapter with router-level require_admin, get_db, UUID and positive-version parsing, existing service delegation, empty 204 after completion, and fixed safe 404/409/503 envelopes. (ai-20261001-011)
# Author review: Keith confirmed review of the retained DELETE adapter changes (ai-20261001-011).
# Tool: Codex (model: GPT-6), date: 2026-10-01
# Scope: Writing implementation code; Refactoring and documentation improvements; Debugging assistance — add explicit /admin GET paths under registered router-level require_admin, reuse canonical response conversion and safe errors, and correct the initial path collision after the registration test exposed the unprefixed router mount. (ai-20261001-012)
# Author review: Keith confirmed review of the retained administrator-read changes (ai-20261001-012).
# Details: ../../ai/usage-log.md; ai-20261001-011; ai-20261001-012

"""Administrator-only supplier reads and deletion."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.db import get_db
from app.services import suppliers
from app.repositories.suppliers import SupplierStatus
from app.schemas import SupplierPageResponse, SupplierResponse
from app.routes.suppliers import _unavailable

router = APIRouter(dependencies=[Depends(require_admin)])


@router.delete("/suppliers/{id}", status_code=204, response_class=Response)
def delete_supplier(
    id: UUID,
    expected_version: Annotated[int, Query(gt=0)],
    session: Annotated[Session, Depends(get_db)],
):
    try:
        suppliers.delete_supplier(session, id, expected_version)
    except suppliers.SupplierNotFound:
        return JSONResponse(status_code=404, content={
            "error": {"code": "SUPPLIER_NOT_FOUND", "message": "Supplier not found."},
        })
    except suppliers.SupplierVersionConflict:
        return JSONResponse(status_code=409, content={
            "error": {
                "code": "VERSION_CONFLICT",
                "message": "This supplier has changed. Reload it before trying again.",
            },
        })
    except suppliers.SupplierDeleteUnavailable:
        return JSONResponse(status_code=503, content={
            "error": {
                "code": "DATABASE_UNAVAILABLE",
                "message": "Supplier deletion is temporarily unavailable.",
            },
        })
    return Response(status_code=204)


@router.get("/admin/suppliers", response_model=SupplierPageResponse)
def get_suppliers(
    session: Annotated[Session, Depends(get_db)],
    status: SupplierStatus = "active",
    area: str | None = None,
    category_id: Annotated[list[UUID], Query()] = [],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    try:
        page = suppliers.list_admin_suppliers(
            session, status=status, area=area, category_ids=category_id,
            limit=limit, offset=offset,
        )
    except suppliers.SupplierReadUnavailable:
        return _unavailable()
    return SupplierPageResponse.from_read(page)


@router.get("/admin/suppliers/{id}", response_model=SupplierResponse)
def get_supplier(id: UUID, session: Annotated[Session, Depends(get_db)]):
    try:
        value = suppliers.get_admin_supplier(session, id)
    except suppliers.SupplierReadUnavailable:
        return _unavailable()
    if value is None:
        return JSONResponse(status_code=404, content={
            "error": {"code": "SUPPLIER_NOT_FOUND", "message": "Supplier not found."},
        })
    return SupplierResponse.from_read(value)
