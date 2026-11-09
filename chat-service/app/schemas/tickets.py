# AI-influenced: WebSocket ticket schema written with Claude (Opus 5.5); see ai/usage-log.md.
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class WsTicketResponse(BaseModel):
    ticket: str
    expires_at: datetime
    expires_in: int
