# AI Assistance Disclosure (hwangjihun):
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-21
# Scope: Implemented Supplier liveness and database-readiness checks.
# Author review: I validated correctness, and added boundary checks.

"""Independent liveness and bounded Supplier database readiness checks."""

import asyncio
from typing import Annotated

import psycopg
from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.errors import ApiError

router = APIRouter(tags=["Operations"])
PROBE_TIMEOUT_SECONDS = 5


async def database_is_ready(database_url: str) -> bool:
    if not database_url.strip():
        return False
    try:
        async with asyncio.timeout(PROBE_TIMEOUT_SECONDS):
            async with await psycopg.AsyncConnection.connect(
                database_url,
                connect_timeout=2,
                options="-c statement_timeout=2000",
                autocommit=True,
            ) as connection:
                # Resolve the tables and check SELECT access without reading rows.
                await connection.execute(
                    "SELECT 1 FROM supplier_service.suppliers, "
                    "supplier_service.categories, supplier_service.supplier_categories LIMIT 0"
                )
        return True
    except (psycopg.Error, TimeoutError):
        # Connection strings and PostgreSQL errors may contain credentials.
        return False


@router.get("/health/live", include_in_schema=False)
def live() -> dict[str, str]:
    return {"status": "live"}


@router.get("/health/ready", include_in_schema=False)
async def ready(settings: Annotated[Settings, Depends(get_settings)]) -> dict[str, str]:
    if not await database_is_ready(settings.database_url):
        raise ApiError(503, "SERVICE_NOT_READY", "The Supplier database is not ready.")
    return {"status": "ready"}
