# AI-influenced: ported from the standalone chat-service with Claude (Opus 5.5);
# see ai/usage-log.md.
from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.state import AppState, get_state

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/ready")
async def ready(state: AppState = Depends(get_state)) -> JSONResponse:
    """Database reachable? Also reports how many sockets this replica holds."""
    try:
        async with state.sessionmaker() as session:
            await session.execute(text("SELECT 1"))
    except Exception:
        return JSONResponse({"status": "db unavailable"}, status_code=503)
    return JSONResponse({"status": "ok", "connections": state.hub.connection_count})
