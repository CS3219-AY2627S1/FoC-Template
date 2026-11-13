# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-30
# Scope: Writing implementation code — write unregistered supplier GET adapters with parsed UUIDs and pagination, explicit response conversion, session injection, and safe 404/503 envelopes.
# Scope: Refactoring and documentation improvements — replace the stale unregistered-router docstring with the public active-only read description. (ai-20260930-022)
# Tool: Codex (model: GPT-6), date: 2026-10-01
# Scope: Writing implementation code; Refactoring and documentation improvements — expose administrator-only POST with raw JSON, atomic service delegation, canonical 201 output, safe errors, and an updated router docstring. (ai-20261001-003)
# Author review: Keith confirmed review of the supplier GET adapters. Keith confirmed review of public-read registration changes (ai-20260930-022).
# Author review: Keith confirmed review of all retained changes for ai-20261001-003.
# Tool: Codex (model: GPT-6), date: 2026-10-01
# Scope: Writing implementation code; Refactoring and documentation improvements — implement the specified administrator-only PATCH adapter using require_admin, get_db, raw JSON, required positive expected_version, the existing atomic update service, canonical response conversion, fixed safe error envelopes, and an updated router docstring. (ai-20261001-007)
# Author review: Keith confirmed review of the retained PATCH adapter changes (ai-20261001-007).
# Details: ../../ai/usage-log.md; ai-20260930-017; ai-20260930-022; ai-20261001-003; ai-20261001-007

"""Public supplier reads and administrator-only creation and updates."""

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.db import get_db
from app.schemas import SupplierPageResponse, SupplierResponse
from app.services import suppliers

router = APIRouter()


def _unavailable() -> JSONResponse:
    return JSONResponse(status_code=503, content={
        "error": {
            "code": "DATABASE_UNAVAILABLE",
            "message": "Supplier details are temporarily unavailable.",
        },
    })


@router.post(
    "/suppliers", status_code=201, response_model=SupplierResponse,
    dependencies=[Depends(require_admin)],
)
def post_supplier(
    payload: Annotated[Any, Body()],
    session: Annotated[Session, Depends(get_db)],
):
    try:
        value = suppliers.create_supplier(session, payload)
    except suppliers.SupplierDuplicate:
        return JSONResponse(status_code=409, content={
            "error": {
                "code": "SUPPLIER_DUPLICATE",
                "message": "An active supplier with this name and location already exists.",
            },
        })
    except suppliers.SupplierCreateUnavailable:
        return JSONResponse(status_code=503, content={
            "error": {
                "code": "DATABASE_UNAVAILABLE",
                "message": "Supplier creation is temporarily unavailable.",
            },
        })
    return SupplierResponse.from_read(value)


@router.patch(
    "/suppliers/{id}", response_model=SupplierResponse,
    dependencies=[Depends(require_admin)],
)
def patch_supplier(
    id: UUID,
    expected_version: Annotated[int, Query(gt=0)],
    payload: Annotated[Any, Body()],
    session: Annotated[Session, Depends(get_db)],
):
    try:
        value = suppliers.update_supplier(session, id, expected_version, payload)
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
    except suppliers.SupplierDuplicate:
        return JSONResponse(status_code=409, content={
            "error": {
                "code": "SUPPLIER_DUPLICATE",
                "message": "An active supplier with this name and location already exists.",
            },
        })
    except suppliers.SupplierUpdateUnavailable:
        return JSONResponse(status_code=503, content={
            "error": {
                "code": "DATABASE_UNAVAILABLE",
                "message": "Supplier update is temporarily unavailable.",
            },
        })
    return SupplierResponse.from_read(value)


@router.get("/suppliers", response_model=SupplierPageResponse)
def get_suppliers(
    session: Annotated[Session, Depends(get_db)],
    area: str | None = None,
    category_id: Annotated[list[UUID], Query()] = [],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    try:
        page = suppliers.list_suppliers(
            session, area=area, category_ids=category_id, limit=limit, offset=offset,
        )
    except suppliers.SupplierReadUnavailable:
        return _unavailable()
    return SupplierPageResponse.from_read(page)


@router.get("/suppliers/{id}", response_model=SupplierResponse)
def get_supplier(id: UUID, session: Annotated[Session, Depends(get_db)]):
    try:
        value = suppliers.get_supplier(session, id)
    except suppliers.SupplierReadUnavailable:
        return _unavailable()
    if value is None:
        return JSONResponse(status_code=404, content={
            "error": {"code": "SUPPLIER_NOT_FOUND", "message": "Supplier not found."},
        })
    return SupplierResponse.from_read(value)
