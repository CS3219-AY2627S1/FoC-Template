# AI-influenced: WebSocket ticket flow written with Claude (Opus 5.5); see ai/usage-log.md.
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Response, status

from app.api.deps import current_user
from app.schemas.tickets import WsTicketResponse
from app.services import tickets
from app.state import AppState, get_state

router = APIRouter(prefix="/chat", tags=["websocket"])


@router.post("/ws-ticket", status_code=status.HTTP_201_CREATED)
async def create_ws_ticket(
    response: Response,
    user: uuid.UUID = Depends(current_user),
    state: AppState = Depends(get_state),
) -> WsTicketResponse:
    """Issue a one-time ticket for `GET /chat/ws?ticket=...` (WebSocket upgrade)."""
    ttl = state.settings.chat_ws_ticket_ttl_s
    async with state.sessionmaker() as session, session.begin():
        ticket, expires_at = await tickets.issue(session, user, ttl)
    response.headers["Cache-Control"] = "no-store"
    return WsTicketResponse(ticket=ticket, expires_at=expires_at, expires_in=ttl)
