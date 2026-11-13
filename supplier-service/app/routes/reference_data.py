# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-30
# Scope: Writing implementation code — write unregistered category and area GET adapters with explicit category conversion, injected category sessions, safe 503 errors, and database-independent area access.
# Scope: Refactoring and documentation improvements — replace the stale unregistered-router docstring with the public controlled-choice description. (ai-20260930-022)
# Author review: Keith confirmed review of the reference-data GET adapters. Keith confirmed review of public-read registration changes (ai-20260930-022).
# Details: ../../ai/usage-log.md; ai-20260930-018; ai-20260930-022

"""Public controlled category and area choices."""

from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import CategoryResponse
from app.services import suppliers

router = APIRouter()


@router.get("/categories", response_model=list[CategoryResponse])
def get_categories(session: Annotated[Session, Depends(get_db)]):
    try:
        categories = suppliers.list_categories(session)
    except suppliers.SupplierReadUnavailable:
        return JSONResponse(status_code=503, content={
            "error": {
                "code": "DATABASE_UNAVAILABLE",
                "message": "Supplier details are temporarily unavailable.",
            },
        })
    return [CategoryResponse.from_read(category) for category in categories]


@router.get("/areas", response_model=list[str])
def get_areas():
    return suppliers.list_areas()
